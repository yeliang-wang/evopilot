import AppKit
import Foundation

// Only the private parent pipe receives data. No clipboard, keychain, disk,
// process environment, command-line input, stderr or stdout credential surface.
func validContext(_ c: [String: Any]) -> Bool {
    var fields = ["purpose", "requestId", "configDigest", "componentDigest", "destination", "tenantId", "workspaceId", "hostId", "username", "bindingDigest", "timeoutMs"]
    if c["authMode"] != nil { guard c["authMode"] as? String == "local-token" else { return false }; fields.append("authMode") }
    guard Set(c.keys) == Set(fields), c["purpose"] as? String == "provision-workspace-llm-secret" else { return false }
    for field in fields where field != "timeoutMs" {
        guard let text = c[field] as? String, !text.isEmpty, text.utf8.count <= 512,
              !text.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { return false }
    }
    guard let limit = c["timeoutMs"] as? Int, limit >= 1000, limit <= 120000 else { return false }
    return true
}

if CommandLine.arguments == [CommandLine.arguments[0], "--self-test"] {
    let context: [String: Any] = ["purpose":"provision-workspace-llm-secret", "requestId":"a", "configDigest":"a", "componentDigest":"a", "destination":"https://example.test", "tenantId":"a", "workspaceId":"a", "hostId":"a", "username":"a", "bindingDigest":"a", "timeoutMs":1000]
    precondition(validContext(context))
    precondition(!validContext([:]))
    var extra = context; extra["password"] = "synthetic"
    precondition(!validContext(extra))
    var control = context; control["workspaceId"] = "bad\nvalue"
    precondition(!validContext(control))
    var token = context; token["authMode"] = "local-token"; precondition(validContext(token))
    token["authMode"] = "unknown"; precondition(!validContext(token))
    print("{\"status\":\"PASS\",\"tests\":6,\"uiShown\":false}")
    exit(0)
}
guard CommandLine.arguments.count == 1 else { exit(64) }
let bytes = FileHandle(fileDescriptor:4, closeOnDealloc:true).readDataToEndOfFile()
guard bytes.count <= 8192,
      let context = (try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any],
      validContext(context) else { exit(65) }
let tokenMode = context["authMode"] as? String == "local-token"
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let timeout = Double(context["timeoutMs"] as! Int) / 1000.0
var expired = false
let timer = Timer(timeInterval:timeout, repeats:false) { _ in expired = true; app.abortModal() }
RunLoop.main.add(timer, forMode:.common)
let confirm = NSAlert()
confirm.messageText = "EvoPilot · 确认本次安全输入范围"
confirm.informativeText = ["Host: \(context["hostId"]!)", "请求: \(context["requestId"]!)", "用途: \(context["purpose"]!)", "Runtime: \(context["destination"]!)", "租户 / 工作区: \(context["tenantId"]!) / \(context["workspaceId"]!)", "账号: \(context["username"]!)", "组件: \(context["componentDigest"]!)", "配置: \(context["configDigest"]!)", tokenMode ? "使用已绑定的本地 Runtime 认证创建工作区 LLM SecretRef；无需输入 Runtime 密码，不会绑定默认 Profile。" : "继续后将登录 Runtime 并创建工作区 LLM SecretRef；不会绑定默认 Profile。"].joined(separator:"\n")
confirm.addButton(withTitle:"确认范围并输入")
confirm.addButton(withTitle:"取消")
confirm.buttons[0].keyEquivalent = ""
app.activate(ignoringOtherApps:true)
guard confirm.runModal() == .alertFirstButtonReturn, !expired else { exit(0) }
let form = NSAlert()
form.messageText = "EvoPilot · 私密输入"
form.informativeText = tokenMode ? "请求 \(context["requestId"]!)\n仅发送至 \(context["destination"]!)。使用已绑定的认证创建 SecretRef；仅需输入 Provider API Key。" : "请求 \(context["requestId"]!)\n仅发送至 \(context["destination"]!)。提交会产生 Runtime 登录审计和 Secret 写入。"
let view = NSView(frame:NSRect(x:0,y:0,width:440,height:120))
let passwordLabel = NSTextField(labelWithString:"Runtime 密码")
passwordLabel.frame = NSRect(x:0,y:96,width:440,height:20)
let password = NSSecureTextField(frame:NSRect(x:0,y:68,width:440,height:24))
let valueLabel = NSTextField(labelWithString:"Provider API Key")
valueLabel.frame = NSRect(x:0,y:38,width:440,height:20)
let value = NSSecureTextField(frame:NSRect(x:0,y:10,width:440,height:24))
for field in [password, value] { field.isAutomaticTextCompletionEnabled = false }
for item in tokenMode ? [valueLabel,value] : [passwordLabel,password,valueLabel,value] { view.addSubview(item) }
form.accessoryView = view
form.addButton(withTitle:"提交至已确认的 Runtime")
form.addButton(withTitle:"取消")
form.buttons[0].keyEquivalent = ""
form.window.initialFirstResponder = tokenMode ? value : password
let result = form.runModal()
timer.invalidate()
defer { password.stringValue = ""; value.stringValue = "" }
guard result == .alertFirstButtonReturn, !expired, (tokenMode || !password.stringValue.isEmpty), !value.stringValue.isEmpty,
      password.stringValue.utf8.count <= 8192, value.stringValue.utf8.count <= 8192 else { exit(0) }
var output: [String:Any] = ["bindingDigest":context["bindingDigest"]!, "value":value.stringValue]
if !tokenMode { output["password"] = password.stringValue }
guard let data = try? JSONSerialization.data(withJSONObject:output) else { exit(65) }
FileHandle(fileDescriptor:3, closeOnDealloc:true).write(data)
