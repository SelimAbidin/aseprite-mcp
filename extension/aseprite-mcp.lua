local BRIDGE_PROTOCOL_VERSION = 1
local EXTENSION_VERSION = "0.1.6"
local MAX_ASEPRITE_SPRITE_DIMENSION = 65535

local bridgeSocket = nil
local bridgeHandshakeTimer = nil
local bridgeHelloSent = false
local bridgeState = "disconnected"
local bridgeLastError = nil
local pluginRef = nil

local handlers = {}

local function newJsonArray()
  return {}
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

local function isInteger(value)
  return type(value) == "number" and value == math.floor(value)
end

local function parseHexColor(value)
  if type(value) ~= "string" or
      (#value ~= 7 and #value ~= 9) or
      string.match(value, "^#%x+$") == nil then
    raiseBridgeError(
      "INVALID_REQUEST",
      "background must use #RRGGBB or #RRGGBBAA format.")
  end

  local red = tonumber(string.sub(value, 2, 3), 16)
  local green = tonumber(string.sub(value, 4, 5), 16)
  local blue = tonumber(string.sub(value, 6, 7), 16)
  local alpha = 255
  if #value == 9 then
    alpha = tonumber(string.sub(value, 8, 9), 16)
  end

  return app.pixelColor.rgba(red, green, blue, alpha)
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

local function documentSummary()
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

handlers.get_document = function(_params)
  return documentSummary()
end

handlers.create_sprite = function(params)
  local paramsType = type(params)
  if paramsType ~= "table" and paramsType ~= "userdata" then
    raiseBridgeError("INVALID_REQUEST", "create_sprite params must be an object.")
  end

  if not isInteger(params.width) or
      params.width < 1 or
      params.width > MAX_ASEPRITE_SPRITE_DIMENSION then
    raiseBridgeError(
      "INVALID_REQUEST",
      "width must be an integer supported by Aseprite.")
  end
  if not isInteger(params.height) or
      params.height < 1 or
      params.height > MAX_ASEPRITE_SPRITE_DIMENSION then
    raiseBridgeError(
      "INVALID_REQUEST",
      "height must be an integer supported by Aseprite.")
  end
  if params.name ~= nil and
      (type(params.name) ~= "string" or
       #params.name < 1 or
       #params.name > 255 or
       string.match(params.name, "%S") == nil) then
    raiseBridgeError(
      "INVALID_REQUEST",
      "name must be a non-empty string of at most 255 characters.")
  end

  local background = nil
  if params.background ~= nil then
    background = parseHexColor(params.background)
  end

  local sprite = nil
  local ok, result = pcall(function()
    sprite = Sprite(params.width, params.height, ColorMode.RGB)
    if sprite == nil then
      error("Aseprite did not create the sprite.")
    end

    if params.name ~= nil then
      sprite.filename = params.name
    end

    if background ~= nil then
      local layer = sprite.layers[1]
      local frame = sprite.frames[1]
      if layer == nil or frame == nil then
        error("The new sprite has no editable layer or frame.")
      end

      local image = Image(sprite.spec)
      image:clear(image.bounds, background)
      local cel = sprite.cels[1]
      if cel == nil then
        sprite:newCel(layer, frame, image, Point(0, 0))
      else
        cel.image = image
      end
    end

    app.refresh()
    return documentSummary()
  end)

  if not ok then
    if sprite ~= nil then
      sprite:close()
    end
    error(result, 0)
  end

  return result
end

handlers.open_sprite = function(params)
  local paramsType = type(params)
  if paramsType ~= "table" and paramsType ~= "userdata" then
    raiseBridgeError("INVALID_REQUEST", "open_sprite params must be an object.")
  end
  if type(params.path) ~= "string" or #params.path < 1 then
    raiseBridgeError("INVALID_REQUEST", "path must be a non-empty string.")
  end

  local sprite = nil
  local ok, result = pcall(function()
    sprite = app.open(params.path)
    if sprite == nil then
      raiseBridgeError(
        "ASEPRITE_OPERATION_FAILED",
        "Aseprite could not open the requested file.")
    end

    app.refresh()
    return documentSummary()
  end)

  if not ok then
    if sprite ~= nil then
      sprite:close()
    end
    if type(result) == "table" and result.bridgeError == true then
      error(result, 0)
    end
    raiseBridgeError(
      "ASEPRITE_OPERATION_FAILED",
      "Aseprite could not open the requested file.",
      { cause = tostring(result) })
  end

  return result
end

local function sendMessage(socket, message)
  if socket == nil then
    return false
  end

  local ok, sendError = pcall(function()
    socket:sendText(json.encode(message))
  end)

  if not ok then
    bridgeLastError = tostring(sendError)
    if bridgeSocket == socket then
      bridgeState = "disconnected"
    end
    return false
  end

  return true
end

local function stopHandshakeTimer()
  if bridgeHandshakeTimer ~= nil then
    bridgeHandshakeTimer:stop()
    bridgeHandshakeTimer = nil
  end
end

local function sendHello(socket)
  if bridgeSocket ~= socket then
    return false
  end

  if bridgeHelloSent then
    return true
  end

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

  if sendMessage(socket, hello) then
    bridgeHelloSent = true
    return true
  end

  return false
end

local function sendError(socket, id, code, message, details)
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

  sendMessage(socket, response)
end

local function handleRequest(socket, request)
  if request.protocolVersion ~= BRIDGE_PROTOCOL_VERSION or
      type(request.id) ~= "string" or
      type(request.method) ~= "string" then
    sendError(socket, request.id or "unknown", "INVALID_REQUEST", "Invalid bridge request.")
    return
  end

  local handler = handlers[request.method]
  if handler == nil then
    sendError(socket, request.id, "UNSUPPORTED_METHOD", "Unsupported method: " .. request.method)
    return
  end

  local ok, result = pcall(handler, request.params or {})
  if not ok then
    if type(result) == "table" and result.bridgeError == true then
      sendError(socket, request.id, result.code, result.message, result.details)
      return
    end

    sendError(socket, request.id, "ASEPRITE_OPERATION_FAILED", tostring(result))
    return
  end

  sendMessage(socket, {
    protocolVersion = BRIDGE_PROTOCOL_VERSION,
    type = "response",
    id = request.id,
    ok = true,
    result = result
  })
end

local function handleMessage(socket, messageType, data, errorMessage)
  if bridgeSocket ~= socket then
    return
  end

  if messageType == WebSocketMessageType.OPEN then
    bridgeLastError = nil
    if sendHello(socket) then
      stopHandshakeTimer()
    end
    return
  end

  if messageType == WebSocketMessageType.CLOSE then
    bridgeHelloSent = false
    bridgeState = "disconnected"
    if errorMessage ~= nil and errorMessage ~= "" then
      bridgeLastError = errorMessage
    end
    return
  end

  if messageType == WebSocketMessageType.ERROR then
    bridgeHelloSent = false
    bridgeState = "error"
    bridgeLastError = errorMessage or data or "Unknown WebSocket error"
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
    stopHandshakeTimer()
    bridgeState = "connected"
    bridgeLastError = nil
  elseif message.type == "request" then
    handleRequest(socket, message)
  end
end

local function startHandshakeTimer(socket)
  stopHandshakeTimer()

  local timer
  timer = Timer {
    interval = 0.25,
    ontick = function()
      if bridgeSocket ~= socket then
        timer:stop()
        return
      end

      if sendHello(socket) then
        timer:stop()
        if bridgeHandshakeTimer == timer then
          bridgeHandshakeTimer = nil
        end
      end
    end
  }
  bridgeHandshakeTimer = timer
  timer:start()
end

local function connectBridge()
  stopHandshakeTimer()

  if bridgeSocket ~= nil then
    bridgeSocket:close()
    bridgeSocket = nil
  end

  bridgeState = "connecting"
  bridgeLastError = nil
  bridgeHelloSent = false

  local socket
  socket = WebSocket {
    url = pluginRef.preferences.serverUrl,
    deflate = false,
    minreconnectwait = 1,
    maxreconnectwait = 10,
    onreceive = function(messageType, data, errorMessage)
      local ok, callbackError = pcall(
        handleMessage,
        socket,
        messageType,
        data,
        errorMessage)

      if not ok and bridgeSocket == socket then
        bridgeState = "error"
        bridgeLastError = tostring(callbackError)
      end
    end
  }
  bridgeSocket = socket
  socket:connect()
  startHandshakeTimer(socket)
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
      local statusText = {
        "State: " .. bridgeState,
        "Server: " .. plugin.preferences.serverUrl
      }
      if bridgeLastError ~= nil then
        statusText[#statusText + 1] = "Last error: " .. bridgeLastError
      end

      app.alert {
        title = "Aseprite MCP",
        text = statusText
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
  stopHandshakeTimer()

  if bridgeSocket ~= nil then
    bridgeSocket:close()
    bridgeSocket = nil
  end
  bridgeState = "disconnected"
  bridgeHelloSent = false
  pluginRef = nil
end
