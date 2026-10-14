import net from 'node:net';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 22 || minor < 14) {
  console.error(
    `Node.js ${process.versions.node} não é suportado neste projeto. Use Node 22.14.0 ou uma versão posterior de Node 22 (nvm install && nvm use).`,
  );
  process.exit(1);
}

async function occupied(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', (error) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(error);
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Não foi possível verificar a porta local.'));
    });
  });
}

try {
  const services = [
    ['frontend', process.env.WEB_PORT || '3000'],
    ['API', process.env.API_PORT || '4000'],
  ];
  let blocked = false;
  for (const [name, configured] of services) {
    const port = Number(configured);
    if (
      !/^\d+$/.test(configured) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    )
      throw new Error(`Porta inválida para ${name}.`);
    if (await occupied(port)) {
      console.error(
        `A porta ${port} (${name}) já está ocupada. Termine a execução anterior com Ctrl+C no respetivo terminal antes de executar pnpm dev novamente.`,
      );
      blocked = true;
    }
  }
  if (blocked) process.exitCode = 1;
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Falha na verificação do ambiente local.',
  );
  process.exitCode = 1;
}
