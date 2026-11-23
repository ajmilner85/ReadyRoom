@echo off
rem Builds the CATCC ATC probe module: ..\bin\catcc_atcprobe.dll, after building and running the self-test
rem (catcc_atcprobe_selftest.cpp, which includes the module: its ABI assumptions, its guarded calls and its undo
rem tried on classes shaped like DCS's). Needs the VS 2022 C++ Build Tools. The DLL is only built if the
rem self-test passes. ..\bin is not committed (.gitignore).
setlocal
set VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat
if not exist "%VCVARS%" set VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat
call "%VCVARS%" >nul || exit /b 1
set HERE=%~dp0
set OUT=%HERE%..\bin
set TMPD=%TEMP%\catcc_atcprobe_build
if not exist "%OUT%" mkdir "%OUT%"
if not exist "%TMPD%" mkdir "%TMPD%"

cl /nologo /O2 /MT /EHa /W3 /GR "%HERE%catcc_atcprobe_selftest.cpp" /Fo"%TMPD%\selftest.obj" /Fe"%TMPD%\catcc_atcprobe_selftest.exe" /link /NOLOGO || exit /b 1
"%TMPD%\catcc_atcprobe_selftest.exe" || (echo SELF-TEST FAILED: the DLL was not built & exit /b 1)

cl /nologo /O2 /MT /EHa /W3 /LD "%HERE%catcc_atcprobe.cpp" /Fo"%TMPD%\catcc_atcprobe.obj" /Fe"%OUT%\catcc_atcprobe.dll" /link /NOLOGO || exit /b 1
del "%OUT%\catcc_atcprobe.exp" "%OUT%\catcc_atcprobe.lib" 2>nul
echo built %OUT%\catcc_atcprobe.dll
