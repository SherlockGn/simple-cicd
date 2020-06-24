const childProcess = require("child_process")

module.exports = async (command, cwd) => {
    return new Promise((resolve, reject) => {
        if (!cwd) {
            cwd = process.cwd()
        }
        // console.log(command, "|", cwd)
        const start = new Date()
        childProcess.exec(command, { cwd }, (err, stdout, stderr) => {
            resolve({
                command,
                cwd: cwd,
                success: !err,
                err,
                stdout,
                stderr,
                start: start.toJSON(),
                duration: (new Date().getTime() - start.getTime()) / 1000
            })
        })
    })
}