module.exports = {
  apps: [{
    name: 'fantasy-log',
    script: 'dist/fantasy-log.js',
    cwd: process.cwd(),
    env: {
      SIM_SEED: 'production-server',
      SIM_TIME_SCALE: '1',
      SIM_CATCH_UP: 'true',
      SIM_CATCH_UP_SPEED: '10'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    max_memory_restart: '500M',
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    watch: false,
    ignore_watch: ['logs', 'world.json', 'events.jsonl'],
    node_args: '--max-old-space-size=512'
  }]
}