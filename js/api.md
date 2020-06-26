# API documentation of simple-cicd

我已经完成了该项目的后端工作，这个是后端API文档，你可以通过Chrome的开发者工具进行后端功能的调试和验证。现阶段只支持服务器是Windows平台。请确保服务器安装了Git。

当你成功克隆项目后，运行`npm install`来安装项目所需要的所有依赖。（如果你安装了`cnpm`, 可以用`cnpm install`）。

用Chrome浏览器打开 http://localhost:3336/page/index.html, 你可以看到一个标有**Homepage**的网页。

打开开发者工具，你可以直接用内置的`ajax`函数进行调试。具体的函数定义如下:

```javascript

async ajax(url: string, method: string, body: object) : object

```

例如:

```javascript
await ajax("/api/project", "POST", {
    git: "https://gitee.com/NekoGong/kitchen-attentions.git",
    keyword: "KitchenAttentions",
    branch: "master",
    clean: [
        "powershell.exe .\\Install-WindowsService.ps1 -Uninstall",
        "#DELETE_PROJECT_FOLDER#"
    ],
    build: [
        {
            command: "powershell.exe #DIR#\\Install-WindowsService.ps1 -Uninstall"
        },
        {
            change: "package.json",
            command: "rd /s /q node_modules"
        },
        {
            change: "package.json",
            command: "cnpm install"
        }
    ],
    run: "powershell.exe .\\Install-WindowsService.ps1"
})
```

下面是API文档:

|  URL   | URL params | METHOD | BODY | 描述 |
| ---- | ---- | ---- | ---- | ---- |
|  /api/project | NA | POST | 项目定义 | 创建项目定义。项目定义如实例所示。请注意，后端**不会**去验证json的合法性，请确保json的格式是合法的。如果项目已存在，会返回`400`。 |
|  /api/project | NA | PUT | 项目定义 | 修改项目定义。项目定义如实例所示。请注意，后端**不会**去验证json的合法性，请确保json的格式是合法的。如果项目不存在，会返回`400`。 |
|  /api/project | NA | DELETE | `{"name": "project-name"}` | 删除项目定义。即使项目不存在也不会返回错误。 |
|  /api/project/act | NA | POST | `{"action": "action", "name": "project-name"}` | clean或者build项目。如果项目仓库不存在则自动clone。如果项目未定义或者action不为字符串"clean"或者"build"会返回`400`。如果项目正在作业中，则也返回`400`。 |
|  /api/log | action以及name | GET | NA | 获取最近一次clean或者build项目过程中产生的日志。如果项目未定义或者action不为字符串"clean"或者"build"会返回`400`。 |
|  /api/status | name或者不提供参数 | GET | NA | 获取服务运行状态。如果不提供参数，则返回所有项目的状态。如果项目未定义会返回`400`。 |
|  /api/status | NA | PUT | `{"action": "action", "name": "project-name"}` | 更改服务运行状态。返回调用`sc.exe`进程的执行结果。如果项目未定义或者action不为字符串"start"或者"stop"会返回`400`。如果项目正在作业中，则也返回`400`。 |