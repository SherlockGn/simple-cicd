Param ([Switch] $Uninstall, [Switch] $DoNotStartService)

$ErrorActionPreference = "Stop"

$ExecutablePath =  "node.exe"
$ScriptEntry =  (Resolve-Path -Path ".\main.js").Path
$Parameters = @($ScriptEntry)
$OutputFolderPath = "$PSScriptRoot\binary"
$ServiceName = "SimpleCICD"
$ServiceDisplayName = "Simple CICD"
$ServiceDescription = "A project to deploy and manage servers!"

New-Item -Type Directory -Path $OutputFolderPath -Force | Out-Null

$OutputFolderPath = (Resolve-Path -Path $OutputFolderPath).Path

If ($Uninstall) {
    If ((Get-Service -Name $ServiceName -ErrorAction "Ignore") -Eq $Null) {
        Write-Host "Service $ServiceName is not installed."
        Remove-Item $OutputFolderPath -Force -Recurse
        Return
    }
    
    Stop-Service -Name $ServiceName -Force

    While ((Get-Service -Name $ServiceName).Status -Eq "Running") {
        Start-Sleep 2
    }

    Remove-Item $OutputFolderPath -Force -Recurse

    $Service = Get-WmiObject -Class Win32_Service -Filter "Name='$ServiceName'"
    $Service.Delete() | Out-Null
    Return
}

If ($ExecutablePath[1] -Eq ":") {
    If (-Not (Test-Path $ExecutablePath)) {
        Throw "Executable path doesn't exist."
    }
}

$CSharpSourceCode = @"
    using System;
    using System.IO;
    using System.Text;
    using System.Diagnostics;
    using System.Threading;
    using System.ServiceProcess;
    public class Program : ServiceBase {

        public static string processName;
        public static string redirectFolder;
        public static string parameters;

        public static void Main(string[] args) {
            /*
                args[0] -> redirect folder
                args[1] -> process name
                args[2..] -> process parameters
            */
            if (args.Length < 2) {
                throw new ArgumentException("You should specify the process parameters");
            }
            processName = args[1];
            redirectFolder = args[0];
            StringBuilder processArgs = new StringBuilder();
            for (int i = 2; i < args.Length; i++) {
                processArgs.Append("\"" + args[i] + "\" ");
            }
            parameters = processArgs.ToString();
            ServiceBase.Run(new Program());
        }

        private Process p;

        protected override void OnStart(string[] args)
        {
            p = new Process();
            p.StartInfo.FileName = processName;
            p.StartInfo.Arguments = parameters;
            p.StartInfo.RedirectStandardOutput = true;
            p.StartInfo.RedirectStandardError = true;
            p.StartInfo.UseShellExecute = false;
            p.Start();

            Thread outputThread = new Thread(RunThread);
            outputThread.Start(new ThreadParameter(true));

            Thread errorThread = new Thread(RunThread);
            errorThread.Start(new ThreadParameter(false));
        }

        protected override void OnStop()
        {
            try { p.Kill(); } catch { }
        }

        public void RunThread(object param) {
            ThreadParameter threadParameter = param as ThreadParameter;
            bool isOutput = threadParameter.isOutput;
            string logFilePath = redirectFolder + (isOutput ? "\\output.txt" : "\\error.txt");
            do
            {
                int ch = isOutput ? p.StandardOutput.Read() : p.StandardError.Read();
                if (ch < 0) {
                    continue;
                }
                string output = Convert.ToChar(ch).ToString();
                File.AppendAllText(logFilePath, output);
            } while (!p.HasExited);
            File.AppendAllText(logFilePath, isOutput ? p.StandardOutput.ReadToEnd() : p.StandardError.ReadToEnd());
        }
    }
    public class ThreadParameter {
        public bool isOutput;
        public ThreadParameter(bool isOutput) {
            this.isOutput = isOutput;
        }
    }
"@

$SourceFilePath = Join-Path -Path $OutputFolderPath -ChildPath "wrapper.cs"

Out-File -InputObject $CSharpSourceCode -FilePath $SourceFilePath
$Is64BitOS = [Environment]::Is64BitOperatingSystem
$RootFolder = [Environment]::ExpandEnvironmentVariables("%SystemRoot%")
$TargetFolder = If ($Is64BitOS) { "Microsoft.NET\Framework64" } Else { "Microsoft.NET\Framework" }
$TargetFolder = Join-Path -Path $RootFolder -ChildPath $TargetFolder
$TargetFolder = (Resolve-Path -Path $TargetFolder).Path

$SubFolders = Get-ChildItem -Path $TargetFolder -Directory | Sort-Object
$TargetFolderName = $SubFolders[$SubFolders.Length - 1].Name
$TargetFolder = Join-Path -Path $TargetFolder -ChildPath $TargetFolderName
$TargetCompiler = Join-Path -Path $TargetFolder -ChildPath "csc.exe"
$OutputBinary = Join-Path -Path $OutputFolderPath -ChildPath "wrapper.exe"


& $TargetCompiler "/out:$OutputBinary" $SourceFilePath | Out-Null

$ParameterString = [string]::Join(" ", $Parameters)
$BinaryPathName = "$OutputBinary $OutputFolderPath $ExecutablePath $ParameterString"
$BinaryPathName
$ServiceParams = @{
  Name = $ServiceName
  BinaryPathName = $BinaryPathName
  DisplayName = $ServiceDisplayName
  Description = $ServiceDescription
}
New-Service @ServiceParams

If (-Not $DoNotStartService) {
    Start-Service -Name $ServiceName
}