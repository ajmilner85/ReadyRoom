@echo off
rem Builds catcc_chocks.dll into the pilot mod (Mods\aircraft\CATCC-Pilot\bin). Needs the VS 2022 C++ Build Tools.
setlocal
set VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat
if not exist "%VCVARS%" set VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat
call "%VCVARS%" >nul || exit /b 1
set HERE=%~dp0
set OUT=%HERE%..\Mods\aircraft\CATCC-Pilot\bin
if not exist "%OUT%" mkdir "%OUT%"
cl /nologo /O2 /MT /EHa /W3 /LD "%HERE%catcc_chocks.cpp" /Fo"%TEMP%\catcc_chocks.obj" /Fe"%OUT%\catcc_chocks.dll" /link /NOLOGO || exit /b 1
del "%OUT%\catcc_chocks.exp" "%OUT%\catcc_chocks.lib" 2>nul
echo built %OUT%\catcc_chocks.dll
