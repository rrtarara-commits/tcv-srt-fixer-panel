@echo off
rem =========================================================================
rem TCV SRT Fixer - Windows 10/11 CEP Extension Installer
rem =========================================================================

echo --------------------------------------------------------
echo Installing TCV SRT Fixer Panel for Adobe Premiere Pro...
echo --------------------------------------------------------

set EXT_DIR=%APPDATA%\Adobe\CEP\extensions\com.tcv.srtfixer
set SRC_DIR=%~dp0

if not exist "%EXT_DIR%" mkdir "%EXT_DIR%"

echo Copying extension files to %EXT_DIR%...
xcopy /E /Y /I "%SRC_DIR%CSXS" "%EXT_DIR%\CSXS"
xcopy /E /Y /I "%SRC_DIR%css" "%EXT_DIR%\css"
xcopy /E /Y /I "%SRC_DIR%js" "%EXT_DIR%\js"
xcopy /E /Y /I "%SRC_DIR%jsx" "%EXT_DIR%\jsx"
copy /Y "%SRC_DIR%index.html" "%EXT_DIR%\"
copy /Y "%SRC_DIR%.debug" "%EXT_DIR%\"

echo Enabling CEP PlayerDebugMode in Windows Registry (CSXS 9 through 20)...
for /L %%V in (9,1,20) do (
    reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)

echo --------------------------------------------------------
echo Installation Complete!
echo Compatible with Adobe Premiere Pro 2024, 2025, 2026, 2027+
echo Restart Adobe Premiere Pro, then find the panel under:
echo Window ^> Extensions ^> TCV SRT Fixer
echo --------------------------------------------------------
pause

