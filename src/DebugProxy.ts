/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { User } from 'azure-arm-website/lib/models';
import * as EventEmitter from 'events';
import { createServer, Server, Socket } from 'net';
import * as fetch from 'node-fetch';
import { OutputChannel } from 'vscode';
import { SiteWrapper } from 'vscode-azureappservice';
import * as websocket from 'websocket';

export class DebugProxy extends EventEmitter {
    private _server: Server | undefined;
    private _wsclient: websocket.client | undefined;
    private _wsconnection: websocket.connection | undefined;
    private _accessToken: string;
    private _siteWrapper: SiteWrapper;
    private _port: number;
    private _publishProfile: User;
    private _keepAlive: boolean;
    private _outputChannel: OutputChannel;

    constructor(outputChannel: OutputChannel, siteWrapper: SiteWrapper, port: number, publishProfile: User, accessToken: string) {
        super();
        this._siteWrapper = siteWrapper;
        this._port = port;
        this._publishProfile = publishProfile;
        this._accessToken = accessToken;
        this._keepAlive = true;
        this._outputChannel = outputChannel;
        this._server = createServer();
    }

    public async startProxy(): Promise<void> {
        if (!this._server) {
            this.emit('error', new Error('Proxy server is not started.'));
        } else {
            // wake up the function app before connecting to it.
            await this.keepAlive();

            this._server.on('connection', (socket: Socket) => {
                if (this._wsclient) {
                    this._outputChannel.appendLine(`[Proxy Server] client rejected ${socket.remoteAddress}:${socket.remotePort}`);
                    this.emit('error', new Error(`[Proxy Server] client rejected ${socket.remoteAddress}:${socket.remotePort}`));
                    socket.destroy();
                } else {
                    this._outputChannel.appendLine(`[Proxy Server] client connected ${socket.remoteAddress}:${socket.remotePort}`);
                    socket.pause();

                    this._wsclient = new websocket.client();

                    this._wsclient.on('connect', (connection: websocket.connection) => {
                        this._outputChannel.appendLine('[WebSocket] client connected');
                        this._wsconnection = connection;

                        connection.on('close', () => {
                            this._outputChannel.appendLine('[WebSocket] client closed');
                            this.dispose();
                            socket.destroy();
                            this.emit('end');
                        });

                        connection.on('error', (err: Error) => {
                            this._outputChannel.appendLine(`[WebSocket] ${err}`);
                            this.dispose();
                            socket.destroy();
                            this.emit('error', err);
                        });

                        connection.on('message', (data: websocket.IMessage) => {
                            socket.write(data.binaryData);
                        });
                        socket.resume();
                    });

                    this._wsclient.on('connectFailed', (err: Error) => {
                        this._outputChannel.appendLine(`[WebSocket] ${err}`);
                        this.dispose();
                        socket.destroy();
                        this.emit('error', err);
                    });

                    this._wsclient.connect(
                        `wss://${this._siteWrapper.appName}.scm.azurewebsites.net/DebugSiteExtension/JavaDebugSiteExtension.ashx`,
                        undefined,
                        undefined,
                        { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
                        { auth: `${this._publishProfile.publishingUserName}:${this._publishProfile.publishingPassword}` }
                    );
                }

                socket.on('data', (data: Buffer) => {
                    if (this._wsconnection) {
                        this._wsconnection.send(data);
                    }
                });

                socket.on('end', () => {
                    this._outputChannel.appendLine(`[Proxy Server] client disconnected ${socket.remoteAddress}:${socket.remotePort}`);
                    this.dispose();
                    this.emit('end');
                });

                socket.on('error', (err: Error) => {
                    this._outputChannel.appendLine(`[Proxy Server] ${err}`);
                    this.dispose();
                    socket.destroy();
                    this.emit('error', err);
                });
            });

            this._server.on('listening', () => {
                this._outputChannel.appendLine('[Proxy Server] start listening');
                this.emit('start');
            });

            this._server.listen({
                host: 'localhost',
                port: this._port,
                backlog: 1
            });
        }
    }

    public dispose(): void {
        if (this._wsconnection) {
            this._wsconnection.close();
            this._wsconnection = undefined;
        }
        this._wsclient = undefined;
        if (this._server) {
            this._server.close();
            this._server = undefined;
        }
        this._keepAlive = false;
    }

    //keep querying the function app state, otherwise the connection will lose.
    private async keepAlive(): Promise<void> {
        if (this._keepAlive) {
            try {
                await this.getFunctionState();
                setTimeout(this.keepAlive, 60 * 1000 /* 60 seconds */);
            } catch (err) {
                this._outputChannel.appendLine(`[Proxy Server] ${err}`);
                setTimeout(this.keepAlive, 5 * 1000 /* 5 seconds */);
            }
        }
    }

    private async getFunctionState(): Promise<void> {
        // tslint:disable-next-line:no-string-literal no-unsafe-any
        const functionAccessToken: string = await this.requestAsync(
            `https://${this._siteWrapper.appName}.scm.azurewebsites.net/api/functions/admin/token`,
            { headers: { Authorization: `Bearer ${this._accessToken}` } }
        );

        // tslint:disable-next-line:no-string-literal no-unsafe-any
        const functionMasterKey: {} = await this.requestAsync(
            `https://${this._siteWrapper.appName}.azurewebsites.net/admin/host/systemkeys/_master`,
            { headers: { Authorization: `Bearer ${functionAccessToken}` } }
        );

        // tslint:disable-next-line:no-string-literal no-unsafe-any
        await this.requestAsync(`https://${this._siteWrapper.appName}.azurewebsites.net/admin/host/status?code=${functionMasterKey['value']}`, {});
    }

    // tslint:disable-next-line:no-any
    private async requestAsync(url: string, options: fetch.RequestInit): Promise<any> {
        const response: fetch.Response = await fetch.default(url, options);
        if (response.ok) {
            try {
                return JSON.parse(await response.clone().json<string>());
            } catch (err) {
                return JSON.parse(await response.text());
            }
        } else {
            throw new Error(`Failed when requesting '${url}'`);
        }
    }
}
