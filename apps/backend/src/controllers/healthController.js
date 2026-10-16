import mongoose from 'mongoose';

export function getMongoConnectionStatus(readyState) {
  switch (readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    case 0:
      return 'disconnected';
    default:
      return 'unknown';
  }
}

export function getHealth(_req, res) {
  const mongodb = getMongoConnectionStatus(mongoose.connection.readyState);
  const databaseConnected = mongodb === 'connected';

  res.status(200).json({
    ok: true,
    data: {
      service: 'kidsguard-api',
      status: databaseConnected ? 'ready' : 'degraded',
      dependencies: {
        mongodb,
      },
      timestamp: new Date().toISOString(),
    },
  });
}
