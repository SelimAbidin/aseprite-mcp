local BRIDGE_PROTOCOL_VERSION = 1
local EXTENSION_VERSION = "0.1.0"

local bridgeSocket = nil
local bridgeState = "disconnected"
local pluginRef = nil

local handlers = {}

local function newJsonArray()
  return json.decode("[]")
end

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

local function layerTypeName(layer)
  if layer.isGroup then
    return "group"
  elseif layer.isTilemap then
    return "tilemap"
  elseif layer.isReference then
    return "reference"
  elseif layer.isBackground then
    return "background"
  elseif layer.isImage then
    return "image"
  end

  return "unknown"
end

local function animationDirectionName(direction)
  if direction == AniDir.FORWARD then
    return "forward"
  elseif direction == AniDir.REVERSE then
    return "reverse"
  elseif direction == AniDir.PING_PONG then
    return "ping-pong"
  elseif direction == AniDir.PING_PONG_REVERSE then
    return "ping-pong-reverse"
  end

  return "unknown"
end

local function rectangleSummary(rectangle)
  return {
    x = rectangle.x,
    y = rectangle.y,
    width = rectangle.width,
    height = rectangle.height
  }
end

local function pointSummary(point)
  return {
    x = point.x,
    y = point.y
  }
end

local function appendPath(path, index)
  local result = {}
  for pathIndex, value in ipairs(path) do
    result[pathIndex] = value
  end
  result[#result + 1] = index
  return result
end

local function summarizeLayers(layers, activeLayer, parentPath)
  local summaries = newJsonArray()
  local activeSummary = nil

  for index, layer in ipairs(layers) do
    local path = appendPath(parentPath, index)
    local summary = {
      editable = layer.isEditable,
      name = layer.name,
      type = layerTypeName(layer),
      visible = layer.isVisible
    }

    if layer.opacity ~= nil then
      summary.opacity = layer.opacity
    end

    if layer.isGroup then
      local children, nestedActive = summarizeLayers(layer.layers, activeLayer, path)
      summary.children = children
      if nestedActive ~= nil then
        activeSummary = nestedActive
      end
    end

    if layer == activeLayer then
      activeSummary = {
        name = layer.name,
        path = path,
        type = layerTypeName(layer)
      }
    end

    summaries[index] = summary
  end

  return summaries, activeSummary
end

local function raiseBridgeError(code, message, details)
  error({
    bridgeError = true,
    code = code,
    details = details,
    message = message
  }, 0)
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

handlers.get_document = function(_params)
  local site = app.site
  local sprite = site.sprite
  if sprite == nil then
    raiseBridgeError("NO_ACTIVE_SPRITE", "Open or create a sprite first.")
  end

  local layers, activeLayer = summarizeLayers(sprite.layers, site.layer, {})
  local result = {
    activeFrameNumber = site.frameNumber,
    colorMode = colorModeName(sprite.colorMode),
    frameCount = #sprite.frames,
    height = sprite.height,
    id = sprite.id,
    isModified = sprite.isModified,
    layers = layers,
    slices = newJsonArray(),
    tags = newJsonArray(),
    width = sprite.width
  }

  local filename = sprite.filename or ""
  if filename ~= "" then
    result.filename = filename
  end

  if activeLayer ~= nil then
    result.activeLayer = activeLayer
  end

  for index, tag in ipairs(sprite.tags) do
    result.tags[index] = {
      direction = animationDirectionName(tag.aniDir),
      fromFrame = tag.fromFrame.frameNumber,
      name = tag.name,
      repeatCount = tag.repeats,
      toFrame = tag.toFrame.frameNumber
    }
  end

  for index, slice in ipairs(sprite.slices) do
    local summary = {
      bounds = rectangleSummary(slice.bounds),
      name = slice.name
    }
    if slice.center ~= nil then
      summary.center = rectangleSummary(slice.center)
    end
    if slice.pivot ~= nil then
      summary.pivot = pointSummary(slice.pivot)
    end
    result.slices[index] = summary
  end

  return result
end

local function sendMessage(message)
  if bridgeSocket ~= nil then
    bridgeSocket:sendText(json.encode(message))
  end
end

local function sendError(id, code, message, details)
  local response = {
    protocolVersion = BRIDGE_PROTOCOL_VERSION,
    type = "response",
    id = id,
    ok = false,
    error = {
      code = code,
      message = message
    }
  }

  if details ~= nil then
    response.error.details = details
  end

  sendMessage(response)
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
    if type(result) == "table" and result.bridgeError == true then
      sendError(request.id, result.code, result.message, result.details)
      return
    end

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
