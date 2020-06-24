const bodyParser = require("body-parser")
const express = require("express")
const path = require("path")

const router = require("./router")

const app = express()

app.disable('x-powered-by')
app.disable('etag')

const resourcePath = path.join(__dirname, "..", "public", "resource")
app.use(`/page`, express.static(resourcePath))

app.use(bodyParser.urlencoded({
    extended: false,
}))

app.use(bodyParser.json())

app.use(router)

module.exports = app