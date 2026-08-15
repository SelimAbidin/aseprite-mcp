local BRIDGE_PROTOCOL_VERSION = 1
local EXTENSION_VERSION = "0.1.0"

local bridgeSocket = nil
local bridgeState = "disconnected"
local pluginRef = nil

local handlers = {}

local function colorModeName(colorMode)
  if colorMode == ColorMode.RGB then
    return "rgb"
  elseif colorMode == ColorMode.GRAY then
    return "grayscale"
  elseif colorMode == ColorMode.INDEXED then
    return "indexed"
  elseif colorMode == ColorMode.TILEMAP then
    return "tilemap"
  end

  return "unknown"
end

local function activeSpriteStatus()
  local sprite = app.sprite
  if sprite == nil then
    return nil
  end

  local filename = sprite.filename or ""
  local name = "Untitled"
  if filename ~= "" then
    name = app.fs.fileName(filename)
  end

  local result = {
    colorMode = colorModeName(sprite.colorMode),
    frameCount = #sprite.frames,
    height = sprite.height,
    id = sprite.id,
    isModified = sprite.isModified,
    name = name,
    width = sprite.width
  }

  if filename ~= "" then
    result.filename = filename
  end

  return result
end

handlers.get_status = function(_params)
  local result = {
    apiVersion = app.apiVersion or 0,
    asepriteVersion = tostring(app.version)
  }

  local sprite = activeSpriteStatus()
  if sprite ~= nil then
    result.activeSprite = sprite
  end

  return result
end

local function sendMessage(message)
  if bridgeSocket ~= nil then
    bridgeSocket:sendText(json.encode(message))
  end
end

local function sendError(id, code, message)
  sendMessage {
    protocolVersion = BRIDGE_PROTOCOL_VERSION,
    type = "response",
    id = id,
    ok = false,
    error = {
      code = code,
      message = message
    }
  }
end

local function handleRequest(request)
  if request.protocolVersion ~= BRIDGE_PROTOCOL_VERSION or
      type(request.id) ~= "string" or
      type(request.method) ~= "string" then
    sendError(request.id or "unknown", "INVALID_REQUEST", "Invalid bridge request.")
    return
  end

  local handler = handlers[request.method]
  if handler == nil then
    sendError(request.id, "UNSUPPORTED_METHOD", "Unsupported method: " .. request.method)
    return
  end

  local ok, result = pcall(handler, request.params or {})
  if not ok then
    sendError(request.id, "ASEPRITE_OPERATION_FAILED", tostring(result))
    return
  end

  sendMessage {
    protocolVersion = BRIDGE_PROTOCOL_VERSION,
    type = "response",
    id = request.id,
    ok = true,
    result = result
  }
end

local function handleMessage(messageType, data)
  if messageType == WebSocketMessageType.OPEN then
    bridgeState = "authenticating"

    local hello = {
      protocolVersion = BRIDGE_PROTOCOL_VERSION,
      type = "hello",
      client = {
        name = "aseprite-mcp-extension",
        version = EXTENSION_VERSION,
        asepriteVersion = tostring(app.version),
        apiVersion = app.apiVersion or 0
      }
    }

    local token = pluginRef.preferences.token or ""
    if token ~= "" then
      hello.token = token
    end

    sendMessage(hello)
    return
  end

  if messageType == WebSocketMessageType.CLOSE then
    bridgeState = "disconnected"
    return
  end

  if messageType ~= WebSocketMessageType.TEXT then
    return
  end

  local ok, message = pcall(json.decode, data)
  if not ok or message == nil then
    return
  end

  if message.type == "hello_accepted" and
      message.protocolVersion == BRIDGE_PROTOCOL_VERSION then
    bridgeState = "connected"
  elseif message.type == "request" then
    handleRequest(message)
  end
end

local function connectBridge()
  if bridgeSocket ~= nil then
    bridgeSocket:close()
    bridgeSocket = nil
  end

  bridgeState = "connecting"
  bridgeSocket = WebSocket {
    url = pluginRef.preferences.serverUrl,
    deflate = false,
    minreconnectwait = 1,
    maxreconnectwait = 10,
    onreceive = handleMessage
  }
  bridgeSocket:connect()
end

local function showConfiguration()
  local dialog = Dialog { title = "Aseprite MCP Bridge" }

  dialog:entry {
    id = "serverUrl",
    label = "Server URL",
    text = pluginRef.preferences.serverUrl
  }
  dialog:entry {
    id = "token",
    label = "Token (optional)",
    text = pluginRef.preferences.token or ""
  }
  dialog:button {
    id = "save",
    text = "Save and Connect",
    focus = true,
    onclick = function()
      pluginRef.preferences.serverUrl = dialog.data.serverUrl
      pluginRef.preferences.token = dialog.data.token
      dialog:close()
      connectBridge()
    end
  }
  dialog:button {
    text = "Cancel",
    onclick = function()
      dialog:close()
    end
  }
  dialog:show()
end

function init(plugin)
  pluginRef = plugin

  if plugin.preferences.serverUrl == nil then
    plugin.preferences.serverUrl = "http://127.0.0.1:3210/aseprite"
  end
  if plugin.preferences.token == nil then
    plugin.preferences.token = ""
  end

  plugin:newCommand {
    id = "AsepriteMcpConnectionStatus",
    title = "MCP Connection Status",
    group = "file_scripts",
    onclick = function()
      app.alert {
        title = "Aseprite MCP",
        text = {
          "State: " .. bridgeState,
          "Server: " .. plugin.preferences.serverUrl
        }
      }
    end
  }

  plugin:newCommand {
    id = "AsepriteMcpConfigure",
    title = "Configure MCP Bridge",
    group = "file_scripts",
    onclick = showConfiguration
  }

  connectBridge()
end

function exit(_plugin)
  if bridgeSocket ~= nil then
    bridgeSocket:close()
    bridgeSocket = nil
  end
  bridgeState = "disconnected"
  pluginRef = nil
end
