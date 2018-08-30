# Configure Maven for Java Azure Functions Development

Maven is a software project management and comprehension tool, which could manage a project's build, reporting and documentation from a central piece of information. The VS Code Azure Functions Extension use maven to generate Java Function project. Please ensure you have already downloaded maven and set the PATH correctly before you create Java Functions.

## Download Maven

You could download maven from [Apache Maven](https://maven.apache.org/download.cgi)

## Set Path For Maven

1. Unpack the archive where you would like to store the binaries

2. Make sure JAVA_HOME is set to the location of your JDK

3. Add the bin directory to your PATH, e.g.:
    * Unix-based operating systems (Linux, Solaris and Mac OS X)

       `export PATH=/usr/local/apache-maven-3.x.y/bin:$PATH`
    * Windows

      `set PATH="c:\program files\apache-maven-3.x.y\bin";%PATH%`

4. Run `mvn --version` to verify that it is correctly installed.

> NOTE: Please restart vscode to make the path effective when you finish the steps above.
