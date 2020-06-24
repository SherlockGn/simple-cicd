const exec = require("./exec")
const os = require("os")
const path = require("path")

let cache = undefined

module.exports = async () => {
    if (cache != undefined) {
        return cache
    }
    const gitVersion = (await exec("git --version")).stdout.trim().split(" ")
    cache = {
        os: {
            type: os.type(),
            platform: os.platform(),
        },
        git: {
            version: gitVersion[gitVersion.length - 1]
        },
        env: {
            workingDir: path.join(__dirname, "..", "..")
        }
    }
    return cache
}