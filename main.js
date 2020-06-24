const app = require("./js/app")
const config = require("./js/config")
const exec = require("./js/exec")

const server = app.listen(config.port)

server.on("listening", function() {
    console.log("server starts successfully...")
})