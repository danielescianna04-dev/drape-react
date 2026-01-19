const axios = require('axios');

const FLY_API_TOKEN = 'FlyV1 fm2_lJPECAAAAAAAEGG2xBDziJso9VMPHpQ72sxUUfGGwrVodHRwczovL2FwaS5mbHkuaW8vdjGUAJLOABVbfh8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDz7fWLHQLuzDaRF8mR43cWRVnKsCtrl7ZA6OO2GvCAMqzgRifaXZ/gw90fPLS9TTRdU36oc+WWKA51M0bTETvkvUOEkvGTwko+JrIdjmIWjuwy7UVH088seGsKNjghj2kciymspmkkqdUPRPgGYg8qPJkowa5pBCIh8zrN6lrCy9L+EnZigxHctYIcAW8QgEEUuXMn+jkYqRT6IlhG3nb2gs+JuIq4c7RaT7p+UhGI=';
const APP_NAME = 'drape-workspaces';
const MACHINE_ID = '6e823d1dfe9658';

async function checkVMStatus() {
    console.log('=== Checking VM Status via Fly.io API ===\n');

    try {
        const response = await axios.get(
            `https://api.machines.dev/v1/apps/${APP_NAME}/machines/${MACHINE_ID}`,
            {
                headers: {
                    'Authorization': `Bearer ${FLY_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const machine = response.data;
        console.log('Machine ID:', machine.id);
        console.log('State:', machine.state);
        console.log('Created:', machine.created_at);
        console.log('Updated:', machine.updated_at);
        console.log('Image:', machine.config?.image);
        console.log('Memory MB:', machine.config?.guest?.memory_mb);
        console.log('Private IP:', machine.private_ip);
        console.log('\nServices:');
        console.log(JSON.stringify(machine.config?.services, null, 2));
        console.log('\nChecks:');
        console.log(JSON.stringify(machine.checks, null, 2));

    } catch (error) {
        console.error('ERROR:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

checkVMStatus();
