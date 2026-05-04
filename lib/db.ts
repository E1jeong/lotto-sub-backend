import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host:             process.env.MYSQL_HOST,
  port:             Number(process.env.MYSQL_PORT) || 3306,
  user:             process.env.MYSQL_USER,
  password:         process.env.MYSQL_PASSWORD,
  database:         process.env.MYSQL_DATABASE,
  connectionLimit:  Number(process.env.MYSQL_CONNECTION_LIMIT) || 10,
  waitForConnections: true,
  timezone: 'Z',
});

pool.on('connection', (connection) => {
  connection.query('SET NAMES utf8mb4');
});

export default pool;
