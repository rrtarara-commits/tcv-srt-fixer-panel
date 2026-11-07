@echo off
rem =========================================================================
rem TCV SRT Fixer - 1-Click Windows Installer
rem Double-click this file in File Explorer to install the extension.
rem No command line or technical setup required!
rem =========================================================================

echo ========================================================
echo    Installing TCV SRT Fixer for Adobe Premiere Pro      
echo ========================================================
echo.

set EXT_DIR=%APPDATA%\Adobe\CEP\extensions\com.tcv.srtfixer
set SRC_DIR=%~dp0

if not exist "%EXT_DIR%" mkdir "%EXT_DIR%"

echo [1/2] Copying extension files to Adobe CEP folder...
xcopy /E /Y /I "%SRC_DIR%CSXS" "%EXT_DIR%\CSXS" >nul
xcopy /E /Y /I "%SRC_DIR%css" "%EXT_DIR%\css" >nul
xcopy /E /Y /I "%SRC_DIR%js" "%EXT_DIR%\js" >nul
xcopy /E /Y /I "%SRC_DIR%jsx" "%EXT_DIR%\jsx" >nul
copy /Y "%SRC_DIR%index.html" "%EXT_DIR%\" >nul
copy /Y "%SRC_DIR%.debug" "%EXT_DIR%\" >nul

echo [2/2] Enabling Premiere Pro compatibility (CSXS 9-20)...
for /L %%V in (9,1,20) do (
    reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)

echo.
echo ========================================================
echo  [SUCCESS] TCV SRT Fixer installed successfully!
echo  Compatible with Adobe Premiere Pro 2024, 2025, 2026, 2027+
echo ========================================================
echo.
echo Next steps:
echo  1. Restart Adobe Premiere Pro (quit and reopen).
echo  2. In Premiere Pro, open:
echo     Window ^> Extensions ^> TCV SRT Fixer
echo  3. Dock the panel next to your Text panel for easy access!
echo.
pause
