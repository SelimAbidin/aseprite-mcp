local bridgeSocket = nil

function init(plugin)
  if plugin.preferences.serverUrl == nil then
    plugin.preferences.serverUrl = "http://127.0.0.1:3210/aseprite"
  end

  plugin:newCommand {
    id = "AsepriteMcpConnectionStatus",
    title = "MCP Connection Status",
    group = "file_scripts",
    onclick = function()
      app.alert("Aseprite MCP bridge scaffolding is installed. Connection support is the next T000 checkpoint.")
    end
  }
end

function exit(_plugin)
  if bridgeSocket ~= nil then
    bridgeSocket:close()
    bridgeSocket = nil
  end
end
