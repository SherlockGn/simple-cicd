const express = require("express")
const os = require("os")
const path = require("path")
const fs = require("fs")

const env = require("./env")
const exec = require("./exec")

const router = express.Router()
const dbFolder = path.join(__dirname, "..", "public", "db")

const execProjectCommand = async (cmd, proj, logPath, logs) => {
    const workingDir = (await env()).env.workingDir
    const exeOption = {
        command: cmd,
        cwd: path.join(workingDir, proj)
    }
    if (exeOption.command === "#DELETE_PROJECT_FOLDER#") {
        exeOption.command = `rd /s /q "${proj}"` 
        exeOption.cwd = workingDir
    } else {
        if (exeOption.command.startsWith("git clone ")) {
            exeOption.cwd = workingDir
        }
        exeOption.command = exeOption.command.replace("#DIR#", exeOption.cwd)
    }
    const ret = await exec(exeOption.command, exeOption.cwd)
    logs.push(ret)
    fs.writeFileSync(logPath, JSON.stringify(logs, undefined, 2))
    return ret
}

const getStatus = async (proj) => {
    const fileName = path.join(dbFolder, `${proj}.json`)
    const workingDir = (await env()).env.workingDir
    const projDir = path.join(workingDir, proj)
    const keyword = JSON.parse(fs.readFileSync(fileName)).keyword
    const gitInfo = {
        cloned: true,
        latest: {
            commit: null,
            message: ""
        },
        branch: ""
    }
    gitInfo.cloned = fs.existsSync(projDir)
    if (!gitInfo.cloned) {
        gitInfo.latest = gitInfo.branch = null
    } else {
        gitInfo.latest.commit = (await exec("git rev-parse HEAD", projDir)).stdout.trim()
        gitInfo.latest.message = (await exec("git log -1 --pretty=%B", projDir)).stdout.trim()
        gitInfo.branch = (await exec("git rev-parse --abbrev-ref HEAD", projDir)).stdout.trim()
    }
    const processInfo = {
        status: null
    }
    const ret = await exec(`sc.exe query ${keyword}`, projDir)
    const scStdout = ret.stdout.trim().toLowerCase()
    if (!ret.success) {
        processInfo.status = "non-existed"
    } else {
        const temp = scStdout.split("\n").filter(i => i.indexOf("state") >= 0)[0].trim().split(" ")
        processInfo.status = temp[temp.length - 1]
    }
    return {
        git: gitInfo,
        process: processInfo
    }
}

router.get("/", (request, response, next) => {
    response.redirect(`/page/index.html`)
})

router.get("/api/env", async (request, response, next) => {
    response.json(await env())
})

router.get("/api/log", async (request, response, next) => {
    const action = request.query.action
    const name = request.query.name
    if (!fs.existsSync(path.join(dbFolder, `${name}.json`))) {
        response.status(400).json({
            param: "name",
            reason: "project not defined"
        })
        return
    }
    if (action !== "clean" && action !== "build") {
        response.status(400).json({
            param: "action",
            reason: "action not defined"
        })
        return
    }
    let loggerPath = path.join(dbFolder, `${name}.${action}.log.json`)
    let logs = []
    if (fs.existsSync(loggerPath)) {
        logs = JSON.parse(fs.readFileSync(loggerPath))
    }
    response.json(logs)
})

router.post("/api/project", async (request, response, next) => {
    const definition = request.body
    const gitPaths = definition.git.split("/")
    const nameDotGit = gitPaths[gitPaths.length - 1]
    const name = nameDotGit.split(".")[0]

    const fileName = path.join(dbFolder, `${name}.json`)
    if (fs.existsSync(fileName)) {
        response.status(400).json({
            param: "git",
            reason: "already exists"
        })
    } else {
        fs.writeFileSync(fileName, JSON.stringify(definition, undefined, 2))
        response.status(204).send()
    }
})

router.put("/api/project", async (request, response, next) => {
    const definition = request.body
    const gitPaths = definition.git.split("/")
    const nameDotGit = gitPaths[gitPaths.length - 1]
    const name = nameDotGit.split(".")[0]

    const fileName = path.join(dbFolder, `${name}.json`)
    if (!fs.existsSync(fileName)) {
        response.status(400).json({
            param: "git",
            reason: "not exists"
        })
    } else {
        fs.writeFileSync(fileName, JSON.stringify(definition, undefined, 2))
        response.status(204).send()
    }
})

router.delete("/api/project", async (request, response, next) => {
    const name = request.body.name
    const fileName = path.join(dbFolder, `${name}.json`)
    if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName)
    }
    response.status(204).send()
})

router.post("/api/project/act", async (request, response, next) => {
    const body = request.body
    const action = body.action
    const name = body.name
    const dbPath = path.join(dbFolder, `${name}.json`)
    const cleanLoggerPath = path.join(dbFolder, `${name}.clean.log.json`)
    const buildLoggerPath = path.join(dbFolder, `${name}.build.log.json`)
    if (!fs.existsSync(dbPath)) {
        response.status(400).json({
            param: "name",
            reason: "project not defined"
        })
        return
    }
    if (action !== "clean" && action !== "build") {
        response.status(400).json({
            param: "action",
            reason: "action not defined"
        })
        return
    }
    const definition = JSON.parse(fs.readFileSync(dbPath))
    const environment = await env()
    const projectPath = path.join(environment.env.workingDir, name)
    const logs = []
    let ret = null
    if (action === "clean") {
        for (const step of definition.clean) {
            await execProjectCommand(step, name, cleanLoggerPath, logs)
        }
    }
    if (action === "build") {
        let cloned = false;

        if (!fs.existsSync(projectPath)) {
            cloned = true
            await execProjectCommand(`git clone ${definition.git}`, name, buildLoggerPath, logs)
        }

        await execProjectCommand(`git checkout ${definition.branch}`, name, buildLoggerPath, logs)

        ret = await execProjectCommand(`git rev-parse HEAD`, name, buildLoggerPath, logs)
        const oldCommit = ret.stdout.trim()

        ret = await execProjectCommand(`git pull -f`, name, buildLoggerPath, logs)

        ret = await execProjectCommand(`git rev-parse HEAD`, name, buildLoggerPath, logs)
        const latestCommit = ret.stdout.trim()

        ret = await execProjectCommand(`git diff ${latestCommit} ${oldCommit} --name-only`, name, buildLoggerPath, logs)

        let fileChangeList = null
        if (ret.stdout.trim() === "") {
            fileChangeList = []
        } else {
            fileChangeList = ret.stdout.trim().split("\n")
        }

        for (const step of definition.build) {
            if (cloned || !step.change || fileChangeList.indexOf(step.change) >= 0) {
                await execProjectCommand(step.command, name, buildLoggerPath, logs)
            }
        }

        await execProjectCommand(definition.run, name, buildLoggerPath, logs)
    }
    console.log("DONE")
    response.status(204).send()
})


router.get("/api/status",  async (request, response, next) => {
    const name = request.query.name
    let ret = null
    if (name === undefined) {
        ret = {}
        const files = fs.readdirSync(dbFolder).filter(f => f.endsWith(".json") && !f.endsWith(".log.json"))
        for (const f of files) {
            const name = f.substring(0, f.lastIndexOf("."))
            const status = await getStatus(name)
            ret[name] = status
        }
    } else {
        if (!fs.existsSync(path.join(dbFolder, `${name}.json`))) {
            response.status(400).json({
                param: "name",
                reason: "not exist"
            })
            return
        }
        ret = await getStatus(name)
    }
    response.json(ret)
})

router.put("/api/status",  async (request, response, next) => {
    const action = request.body.action
    const name = request.body.name
    const fileName = path.join(dbFolder, `${name}.json`)
    if (!fs.existsSync(fileName)) {
        response.status(400).json({
            param: "name",
            reason: "project not defined"
        })
        return
    }
    if (action !== "start" && action !== "stop") {
        response.status(400).json({
            param: "action",
            reason: "action not defined"
        })
        return
    }
    const keyword = JSON.parse(fs.readFileSync(fileName)).keyword
    response.json(await exec(`sc.exe ${action} ${keyword}`))
})

module.exports = router