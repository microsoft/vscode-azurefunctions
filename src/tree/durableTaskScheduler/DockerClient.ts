import * as ContainerClient from '@microsoft/vscode-container-client';

export interface DockerContainer {
    id: string;
    image: string;
    name: string;
    ports: { [key: number]: number };
}

export interface DockerContainerInternal {
    ID: string;
    Image: string;
    Names: string;
    Ports: string;
}

export interface DockerClient {
    getContainers(): Promise<DockerContainer[]>;
}

export class CliDockerClient implements DockerClient {
    async getContainers(): Promise<DockerContainer[]> {

        const dockerClient = new ContainerClient.DockerClient();
        const factory = new ContainerClient.ShellStreamCommandRunnerFactory({
        });

        const commandRunner = factory.getCommandRunner();

        const containers = await commandRunner(dockerClient.listContainers({}));

        return containers.map(
            container => ({
                id: container.id,
                image: container.image.image as string,
                name: container.name,
                ports: []
            }));
    }
}
