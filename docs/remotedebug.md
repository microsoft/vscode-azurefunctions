# Remote Debugging Java functions in VS Code

## Configurations for Function App

To enable remote debugging for Java functions, the following configurations of the selected Function App will be changed:
- `use32BitWorkerProcess` will be set to false
- `webSocketsEnabled` will be set to true

Besides, the following key-value pairs will be added to the Application Settings:
- JAVA_OPTS: `-Djava.net.preferIPv4Stack=true -Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=127.0.0.1:8898`
- HTTP_PLATFORM_DEBUG_PORT: `8898`

## Usage illustration
![RemoteDebug](resources/RemoteDebug.gif)
