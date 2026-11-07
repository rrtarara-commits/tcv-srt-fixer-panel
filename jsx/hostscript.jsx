/*************************************************************************
 * TCV SRT Fixer - ExtendScript Host Script for Adobe Premiere Pro
 * Provides timeline caption inspection, project bin file scanning,
 * disk I/O, and automated caption track creation.
 *************************************************************************/

// Micro JSON polyfill for ExtendScript (ECMAScript 3)
var TCV_JSON = {
    stringify: function (obj) {
        var t = typeof (obj);
        if (t !== "object" || obj === null) {
            if (t === "string") return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
            return String(obj);
        }
        var json = [];
        var isArr = (obj && obj.constructor === Array);
        for (var n in obj) {
            if (obj.hasOwnProperty(n)) {
                var v = obj[n];
                var vt = typeof (v);
                if (vt === "function" || vt === "undefined") continue;
                var valStr = (vt === "object" && v !== null) ? TCV_JSON.stringify(v) :
                    (vt === "string" ? '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"' : String(v));
                json.push((isArr ? "" : '"' + n + '":') + valStr);
            }
        }
        return (isArr ? "[" : "{") + json.join(",") + (isArr ? "]" : "}");
    },
    parse: function (str) {
        return eval("(" + str + ")");
    }
};

var TCV_Host = {
    /**
     * Get active sequence details
     */
    getActiveSequenceInfo: function () {
        try {
            if (!app.project) {
                return TCV_JSON.stringify({ success: false, error: "No project currently open in Premiere Pro." });
            }
            var seq = app.project.activeSequence;
            if (!seq) {
                return TCV_JSON.stringify({
                    success: false,
                    hasActiveSequence: false,
                    projectName: app.project.name || "Untitled",
                    projectPath: app.project.path || ""
                });
            }

            return TCV_JSON.stringify({
                success: true,
                hasActiveSequence: true,
                sequenceName: seq.name,
                sequenceID: seq.sequenceID,
                timebase: seq.timebase,
                zeroPoint: seq.zeroPoint,
                end: seq.end,
                frameSizeHorizontal: seq.frameSizeHorizontal,
                frameSizeVertical: seq.frameSizeVertical,
                projectName: app.project.name || "Untitled",
                projectPath: app.project.path || "",
                preferredFolder: TCV_Host.getPreferredExportFolder()
            });
        } catch (e) {
            return TCV_JSON.stringify({ success: false, error: e.toString() });
        }
    },

    /**
     * Get best persistent directory for exported caption files (avoids macOS /private/var/folders sandbox errors)
     */
    getPreferredExportFolder: function () {
        try {
            // 1. Current Project folder (permanent, alongside project media, zero macOS sandbox issues)
            if (app.project && app.project.path) {
                var prjFile = new File(app.project.path);
                if (prjFile.parent && prjFile.parent.exists) {
                    var captionsFolder = new Folder(prjFile.parent.fsName + "/TCV_Captions");
                    if (!captionsFolder.exists) {
                        captionsFolder.create();
                    }
                    if (captionsFolder.exists) {
                        return captionsFolder.fsName;
                    }
                    return prjFile.parent.fsName;
                }
            }

            // 2. User Documents folder
            if (Folder.myDocuments && Folder.myDocuments.exists) {
                var docFolder = new Folder(Folder.myDocuments.fsName + "/TCV_Captions");
                if (!docFolder.exists) {
                    docFolder.create();
                }
                if (docFolder.exists) {
                    return docFolder.fsName;
                }
                return Folder.myDocuments.fsName;
            }

            // 3. Desktop
            if (Folder.desktop && Folder.desktop.exists) {
                return Folder.desktop.fsName;
            }

            return "/tmp";
        } catch (e) {
            return "/tmp";
        }
    },

    /**
     * Recursively scan project bin for SRT, VTT, or caption files
     */
    findProjectSubtitleFiles: function () {
        try {
            if (!app.project) {
                return TCV_JSON.stringify({ success: false, error: "No open project." });
            }

            var results = [];

            function traverse(item, currentPath) {
                if (!item) return;
                var itemPath = currentPath ? currentPath + "/" + item.name : item.name;

                if (item.type === ProjectItemType.BIN) {
                    for (var i = 0; i < item.children.numItems; i++) {
                        traverse(item.children[i], itemPath);
                    }
                } else if (item.type === ProjectItemType.CLIP || item.type === ProjectItemType.FILE) {
                    var mediaPath = "";
                    try {
                        mediaPath = item.getMediaPath();
                    } catch (err) {}

                    var lowerName = (item.name || "").toLowerCase();
                    var lowerPath = (mediaPath || "").toLowerCase();

                    var isSrt = (lowerName.indexOf(".srt") !== -1 || lowerPath.indexOf(".srt") !== -1);
                    var isVtt = (lowerName.indexOf(".vtt") !== -1 || lowerPath.indexOf(".vtt") !== -1);
                    var isSub = (lowerName.indexOf(".sub") !== -1 || lowerPath.indexOf(".sub") !== -1);

                    if (isSrt || isVtt || isSub || item.canChangeMediaPath()) {
                        results.push({
                            nodeId: item.nodeId,
                            name: item.name,
                            mediaPath: mediaPath,
                            treePath: itemPath,
                            isSrt: isSrt,
                            isVtt: isVtt
                        });
                    }
                }
            }

            traverse(app.project.rootItem, "");
            return TCV_JSON.stringify({ success: true, items: results });
        } catch (e) {
            return TCV_JSON.stringify({ success: false, error: e.toString() });
        }
    },

    /**
     * Read an SRT file from local disk
     */
    readDiskFile: function (path) {
        try {
            var f = new File(path);
            if (!f.exists) {
                return TCV_JSON.stringify({ success: false, error: "File not found at: " + path });
            }
            f.encoding = "UTF-8";
            if (!f.open("r")) {
                return TCV_JSON.stringify({ success: false, error: "Cannot open file for reading: " + path });
            }
            var content = f.read();
            f.close();
            return TCV_JSON.stringify({ success: true, path: path, content: content });
        } catch (e) {
            return TCV_JSON.stringify({ success: false, error: e.toString() });
        }
    },

    /**
     * Write text to disk with strict Windows CRLF normalization and UTF-8 encoding
     */
    writeDiskFile: function (path, content) {
        try {
            var f = new File(path);
            var parent = f.parent;
            if (parent && !parent.exists) {
                parent.create();
            }
            f.encoding = "UTF-8";
            f.lineFeed = "Windows"; // Force CRLF on macOS and Windows for Premiere ImporterSRT
            if (!f.open("w")) {
                return TCV_JSON.stringify({ success: false, error: "Could not open file for writing: " + path });
            }
            // Normalize all newlines to CRLF (\r\n) so Premiere Pro ImporterSRT never chokes
            var cleanContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r\n");
            f.write(cleanContent);
            f.close();
            return TCV_JSON.stringify({ success: true, path: f.fsName });
        } catch (e) {
            return TCV_JSON.stringify({ success: false, error: e.toString() });
        }
    },

    /**
     * Find or create a specific bin in the project root
     */
    getOrCreateBin: function (binName) {
        var root = app.project.rootItem;
        if (!root) return null;
        for (var i = 0; i < root.children.numItems; i++) {
            var item = root.children[i];
            if (item && item.type === ProjectItemType.BIN && item.name === binName) {
                return item;
            }
        }
        try {
            return root.createBin(binName);
        } catch (e) {
            return root;
        }
    },

    /**
     * Import a corrected SRT file into the project bin and create/apply a caption track on active sequence
     */
    importAndApplyCaptionTrack: function (srtFilePath, customBinName) {
        try {
            if (!app.project) {
                return TCV_JSON.stringify({ success: false, error: "No active Premiere project found." });
            }

            var f = new File(srtFilePath);
            if (!f.exists) {
                return TCV_JSON.stringify({ success: false, error: "SRT file does not exist on disk: " + srtFilePath });
            }

            var binName = customBinName || "TCV QC Captions";
            var targetBin = null;
            try {
                targetBin = TCV_Host.getOrCreateBin(binName);
            } catch (bErr) {
                targetBin = app.project.rootItem;
            }
            if (!targetBin) {
                targetBin = app.project.rootItem;
            }

            // Import files into target bin
            var fileArray = [f.fsName];
            var suppressUI = true;
            var importSuccess = false;
            try {
                importSuccess = app.project.importFiles(fileArray, suppressUI, targetBin, false);
            } catch (impErr) {
                // If custom bin import threw, retry with project rootItem
                try {
                    importSuccess = app.project.importFiles(fileArray, suppressUI, app.project.rootItem, false);
                } catch (impErr2) {}
            }

            if (!importSuccess) {
                return TCV_JSON.stringify({
                    success: false,
                    filePath: f.fsName,
                    error: "app.project.importFiles could not load: " + f.fsName
                });
            }

            // Find the imported project item (search targetBin, then rootItem backwards)
            var importedItem = null;
            var fileNameOnly = f.name;
            var searchBin = targetBin || app.project.rootItem;
            if (searchBin && searchBin.children) {
                for (var i = searchBin.children.numItems - 1; i >= 0; i--) {
                    var child = searchBin.children[i];
                    if (child && (child.name === fileNameOnly || child.name.indexOf(fileNameOnly.replace(".srt", "")) !== -1)) {
                        importedItem = child;
                        break;
                    }
                }
            }
            if (!importedItem && app.project.rootItem && app.project.rootItem.children) {
                for (var j = app.project.rootItem.children.numItems - 1; j >= 0; j--) {
                    var rChild = app.project.rootItem.children[j];
                    if (rChild && (rChild.name === fileNameOnly || rChild.name.indexOf(fileNameOnly.replace(".srt", "")) !== -1)) {
                        importedItem = rChild;
                        break;
                    }
                }
            }

            var activeSeq = app.project.activeSequence;
            var trackCreated = false;
            var trackMethod = "none";
            var trackError = "";

            if (activeSeq && importedItem) {
                // Try createCaptionTrack methods across Premiere Pro versions
                try {
                    if (typeof activeSeq.createCaptionTrack === "function") {
                        // Method 1: Official modern enum createCaptionTrack(item, 0, Sequence.CAPTION_FORMAT_SUBTITLE)
                        try {
                            if (typeof Sequence !== "undefined" && Sequence.CAPTION_FORMAT_SUBTITLE !== undefined) {
                                trackCreated = activeSeq.createCaptionTrack(importedItem, 0, Sequence.CAPTION_FORMAT_SUBTITLE);
                                if (trackCreated) trackMethod = "createCaptionTrack(item, 0, CAPTION_FORMAT_SUBTITLE)";
                            }
                        } catch (e1) {}

                        // Method 2: createCaptionTrack(projectItem, startTime)
                        if (!trackCreated) {
                            try {
                                trackCreated = activeSeq.createCaptionTrack(importedItem, 0);
                                if (trackCreated) trackMethod = "createCaptionTrack(item, 0)";
                            } catch (e2) {}
                        }
                        
                        // Method 3: createCaptionTrack(projectItem, startTime, 'SubRip')
                        if (!trackCreated) {
                            try {
                                trackCreated = activeSeq.createCaptionTrack(importedItem, 0, "SubRip");
                                if (trackCreated) trackMethod = "createCaptionTrack(item, 0, 'SubRip')";
                            } catch (e3) {}
                        }

                        // Method 4: createCaptionTrack(projectItem)
                        if (!trackCreated) {
                            try {
                                trackCreated = activeSeq.createCaptionTrack(importedItem);
                                if (trackCreated) trackMethod = "createCaptionTrack(item)";
                            } catch (e4) {}
                        }
                    }
                } catch (tErr) {
                    trackError = tErr.toString();
                }
            }

            return TCV_JSON.stringify({
                success: true,
                importedFilePath: f.fsName,
                importedItemName: importedItem ? importedItem.name : fileNameOnly,
                binName: binName,
                hasActiveSequence: !!activeSeq,
                sequenceName: activeSeq ? activeSeq.name : null,
                trackCreatedOnTimeline: !!trackCreated,
                trackMethod: trackMethod,
                trackError: trackError,
                message: trackCreated ? 
                    "Synced to timeline as a new caption track! (Saved: " + f.name + ")" :
                    "Imported into bin '" + binName + "'. (Ready to drag onto timeline. Saved: " + f.name + ")"
            });
        } catch (e) {
            return TCV_JSON.stringify({ success: false, error: e.toString() });
        }
    },

    /**
     * Show OS file picker dialog to let user pick an SRT file
     */
    pickSrtFile: function () {
        try {
            var f = File.openDialog("Select Subtitle File for QC", "SubRip Files:*.srt;All Files:*.*", false);
            if (f) {
                return TCV_Host.readDiskFile(f.fsName);
            }
            return TCV_JSON.stringify({ success: false, cancelled: true });
        } catch (e) {
            return TCV_JSON.stringify({ success: false, error: e.toString() });
        }
    },

    /**
     * Show OS save dialog to save corrected SRT
     */
    saveSrtDialog: function (defaultName, content) {
        try {
            var f = File.saveDialog("Save Corrected SRT", "SubRip Files:*.srt", defaultName || "subtitles_qc.srt");
            if (f) {
                return TCV_Host.writeDiskFile(f.fsName, content);
            }
            return TCV_JSON.stringify({ success: false, cancelled: true });
        } catch (e) {
            return TCV_JSON.stringify({ success: false, error: e.toString() });
        }
    },

    /**
     * Automatically scan Project directory, Desktop, and Downloads for the most recently exported .srt
     */
    findRecentSrtOnDisk: function () {
        try {
            var foldersToCheck = [];

            // 1. Current Project folder
            if (app.project && app.project.path) {
                var prjFile = new File(app.project.path);
                if (prjFile.parent && prjFile.parent.exists) {
                    foldersToCheck.push(prjFile.parent);
                }
            }

            // 2. Desktop
            if (Folder.desktop && Folder.desktop.exists) {
                foldersToCheck.push(Folder.desktop);
            }

            // 3. User Downloads
            var dl = new Folder("~/Downloads");
            if (dl.exists) {
                foldersToCheck.push(dl);
            }

            // 4. Documents
            if (Folder.myDocuments && Folder.myDocuments.exists) {
                foldersToCheck.push(Folder.myDocuments);
            }

            var newestFile = null;
            var newestTime = 0;

            for (var i = 0; i < foldersToCheck.length; i++) {
                var folder = foldersToCheck[i];
                var files = folder.getFiles("*.srt");
                if (files) {
                    for (var j = 0; j < files.length; j++) {
                        var f = files[j];
                        if (f instanceof File) {
                            var m = f.modified ? f.modified.getTime() : 0;
                            if (m > newestTime) {
                                newestTime = m;
                                newestFile = f;
                            }
                        }
                    }
                }
            }

            if (newestFile) {
                newestFile.encoding = "UTF-8";
                if (newestFile.open("r")) {
                    var content = newestFile.read();
                    newestFile.close();
                    return TCV_JSON.stringify({
                        success: true,
                        path: newestFile.fsName,
                        name: newestFile.name,
                        modifiedTime: newestTime,
                        content: content
                    });
                }
            }

            return TCV_JSON.stringify({
                success: false,
                error: "No recent .srt file found. In Premiere's Text panel (Captions tab), click ... > 'Export to SRT file', then click Auto-Detect."
            });
        } catch (e) {
            return TCV_JSON.stringify({ success: false, error: e.toString() });
        }
    }
};
