/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { User } from '@azure/arm-appservice';
import { ParsedSite, pingFunctionApp } from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import { EventEmitter } from 'events';
import { createServer, Server, Socket } from 'net';
import * as websocket from 'websocket';
import { ext } from '../../extensionVariables';

export class DebugProxy extends EventEmitter {
    private _server: Server | undefined;
    private _wsclient: websocket.client | undefined;
    private _wsconnection: websocket.connection | undefined;
    private readonly _site: ParsedSite;
    private readonly _port: number;
    private readonly _publishCredential: User;
    private _keepAlive: boolean;

    constructor(site: ParsedSite, port: number, publishCredential: User) {
        super();
        this._site = site;
        this._port = port;
        this._publishCredential = publishCredential;
        this._keepAlive = true;
        this._server = createServer();
    }

    public async startProxy(context: IActionContext): Promise<void> {
        if (!this._server) {
            this.emit('error', new Error('Proxy server is not started.'));
        } else {
            // wake up the Function App before connecting to it.
            await this.keepAlive(context);

            this._server.on('connection', (socket: Socket) => {
                if (this._wsclient) {
                    ext.outputChannel.appendLog(`[Proxy Server] The server is already connected. Rejected connection to "${socket.remoteAddress}:${socket.remotePort}"`);
                    this.emit('error', new Error(`[Proxy Server]  The server is already connected. Rejected connection to "${socket.remoteAddress}:${socket.remotePort}"`));
                    socket.destroy();
                } else {
                    ext.outputChannel.appendLog(`[Proxy Server] client connected ${socket.remoteAddress}:${socket.remotePort}`);
                    socket.pause();

                    this._wsclient = new websocket.client();

                    this._wsclient.on('connect', (connection: websocket.connection) => {
                        ext.outputChannel.appendLog('[WebSocket] client connected');
                        this._wsconnection = connection;

                        connection.on('close', () => {
                            ext.outputChannel.appendLog('[WebSocket] client closed');
                            this.dispose();
                            socket.destroy();
                            this.emit('end');
                        });

                        connection.on('error', (err: Error) => {
                            ext.outputChannel.appendLog(`[WebSocket] ${err}`);
                            this.dispose();
                            socket.destroy();
                            this.emit('error', err);
                        });

                        connection.on('message', (data: websocket.Message) => {
                            if ('binaryData' in data && data.binaryData) {
                                socket.write(data.binaryData);
                            }
                        });
                        socket.resume();
                    });

                    this._wsclient.on('connectFailed', (err: Error) => {
                        ext.outputChannel.appendLog(`[WebSocket] ${err}`);
                        this.dispose();
                        socket.destroy();
                        this.emit('error', err);
                    });

                    this._wsclient.connect(
                        `wss://${this._site.kuduHostName}/DebugSiteExtension/JavaDebugSiteExtension.ashx`,
                        undefined,
                        undefined,
                        { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
                        { auth: `${this._publishCredential.publishingUserName}:${this._publishCredential.publishingPassword}` }
                    );

                    socket.on('data', (data: Buffer) => {
                        if (this._wsconnection) {
                            this._wsconnection.send(data);
                        }
                    });

                    socket.on('end', () => {
                        ext.outputChannel.appendLog(`[Proxy Server] client disconnected ${socket.remoteAddress}:${socket.remotePort}`);
                        this.dispose();
                        this.emit('end');
                    });

                    socket.on('error', (err: Error) => {
                        ext.outputChannel.appendLog(`[Proxy Server] ${err}`);
                        this.dispose();
                        socket.destroy();
                        this.emit('error', err);
                    });
                }
            });

            this._server.on('listening', () => {
                ext.outputChannel.appendLog('[Proxy Server] start listening');
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
        if (this._wsclient) {
            this._wsclient.abort();
            this._wsclient = undefined;
        }
        if (this._server) {
            this._server.close();
            this._server = undefined;
        }
        this._keepAlive = false;
    }

    //keep querying the Function App state, otherwise the connection will lose.
    private async keepAlive(context: IActionContext): Promise<void> {
        if (this._keepAlive) {
            try {
                await pingFunctionApp(context, this._site);
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                setTimeout(this.keepAlive, 60 * 1000 /* 60 seconds */);
            } catch (err) {
                ext.outputChannel.appendLog(`[Proxy Server] ${err}`);
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                setTimeout(this.keepAlive, 5 * 1000 /* 5 seconds */);
            }
        }
    }
}
