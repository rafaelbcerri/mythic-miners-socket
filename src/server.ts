import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local first, then .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

console.log('process.env', process.env);

import { SimpleWebSocketServer } from './SimpleWebSocketServer';
import { WebSocketServerConfig } from './types';

const config: WebSocketServerConfig = {
    port: parseInt(process.env.PORT || '3031'),
    pingInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000'),     // Send ping every 30 seconds
    pongTimeout: 60000,      // Timeout clients after 60 seconds without pong
};

async function startServer() {
    const gameServer = new SimpleWebSocketServer(config);
    let isShuttingDown = false;

    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
        if (isShuttingDown) {
            console.log('Forcefully shutting down...');
            process.exit(1);
        }

        isShuttingDown = true;
        console.log(`Received ${signal}, shutting down gracefully...`);

        // Set a timeout for graceful shutdown
        const shutdownTimeout = setTimeout(() => {
            console.log('Graceful shutdown timeout, forcing exit...');
            process.exit(1);
        }, 10000); // 10 seconds timeout

        try {
            await gameServer.stop();
            clearTimeout(shutdownTimeout);
            console.log('Server stopped successfully');
            process.exit(0);
        } catch (error) {
            clearTimeout(shutdownTimeout);
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    };




    // Set up signal handlers
    process.on('SIGINT', () => {
        console.log('SIGINT signal received');
        gracefulShutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
        console.log('SIGTERM signal received');
        gracefulShutdown('SIGTERM');
    });
    process.on('SIGHUP', () => {
        console.log('SIGHUP signal received');
        gracefulShutdown('SIGHUP');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        gracefulShutdown('unhandledRejection');
    });

    try {
        console.log('Setting up signal handlers...');
        console.log('Signal handlers set up successfully');
        await gameServer.start();

        // Log server stats periodically
        const statsInterval = setInterval(() => {
            if (isShuttingDown) {
                clearInterval(statsInterval);
                return;
            }

            const clientCount = gameServer.getClientCount();
            const clients = gameServer.getClients();
            const aliveClients = clients.filter(c => c.isAlive).length;

            console.log(`Server stats - Total clients: ${clientCount}, Alive: ${aliveClients}`);
        }, 60000); // Every 60 seconds

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer(); 