@echo off
rem Builds the CATCC crew test module: ..\bin\catcc_crew.dll, after building and running the self-test
rem (catcc_crew_selftest.cpp, which includes the module: its ABI assumptions and its scans tried on classes
rem shaped like DCS's). Needs the VS 2022 C++ Build Tools. The DLL is only built if the self-test passes.
setlocal
set VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat
if not exist "%VCVARS%" set VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat
call "%VCVARS%" >nul || exit /b 1
set HERE=%~dp0
set OUT=%HERE%..\bin
set TMPD=%TEMP%\catcc_crew_build
if not exist "%OUT%" mkdir "%OUT%"
if not exist "%TMPD%" mkdir "%TMPD%"

cl /nologo /O2 /MT /EHa /W3 /GR "%HERE%catcc_crew_selftest.cpp" /Fo"%TMPD%\selftest.obj" /Fe"%TMPD%\catcc_crew_selftest.exe" /link /NOLOGO || exit /b 1
"%TMPD%\catcc_crew_selftest.exe" || (echo SELF-TEST FAILED: the DLL was not built & exit /b 1)

cl /nologo /O2 /MT /EHa /W3 /LD "%HERE%catcc_crew.cpp" /Fo"%TMPD%\catcc_crew.obj" /Fe"%OUT%\catcc_crew.dll" /link /NOLOGO || exit /b 1
del "%OUT%\catcc_crew.exp" "%OUT%\catcc_crew.lib" 2>nul
echo built %OUT%\catcc_crew.dll
