import * as ContainerClient from '@microsoft/vscode-container-client';

export interface DockerContainer {
    id: string;
    image: string;
    name: string;
    ports: { [key: number]: number };
}

export interface DockerClient {
    getContainers(): Promise<DockerContainer[]>;
    stopContainer(id: string): Promise<void>;
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

    async stopContainer(id: string): Promise<void> {
        const dockerClient = new ContainerClient.DockerClient();
        const factory = new ContainerClient.ShellStreamCommandRunnerFactory({
        });

        const commandRunner = factory.getCommandRunner();

        await commandRunner(dockerClient.stopContainers({
            container: [id]
        }));
    }
}
