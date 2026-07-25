using './main.bicep'

param env = 'staging'
// postgresAdminPassword and sessionSecret are supplied on the command line:
//   -p postgresAdminPassword=$(openssl rand -hex 24) -p sessionSecret=$(openssl rand -hex 32)
