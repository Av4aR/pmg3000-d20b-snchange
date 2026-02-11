/*=============================================================================================================================================================================================================================================
Script Name: snchange.js
Description: This script provides an easy way to change the
serial number (Modem-ID) of the Zyxel PMG3000-D20B SFP GPON ONU
on firmware versions without access to SSH.
Args: NONE
Author: Av4aR
Github: https://github.com/Av4aR/pmg3000-d20b-snchange

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. 
=============================================================================================================================================================================================================================================*/

//---------------------------------------
//Imports
//---------------------------------------

import ping from 'ping';
import readline from 'node:readline';
import net from 'node:net';
import fs from 'fs';

//---------------------------------------
//Variables
//---------------------------------------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let ONU_IP = '10.10.1.1';
let ONU_USER = 'admin';
let ONU_PASS = '1234';

//---------------------------------------
//Functions
//---------------------------------------

async function getUserInput(question) {

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
        resolve(answer);
    });
  });
}

async function onuReachable(ip) {

    return (await ping.promise.probe(ip, {timeout: 0.2, min_reply: 3})).alive; //Wait for 200ms per reply for 3 replies
}

async function credentialsValid(username, password) {

    let authResponse = await fetch(`http://${ONU_IP}/`, {
        headers: {
            'method': 'GET',
            'Authorization': `Basic ${Buffer.from(username + ':' + password).toString('base64')}`
        }
    }).then(response => {
        return response.status;
    }).catch(() => { //Don't care what went wrong
        return null;
    });
    if(authResponse == null || authResponse == 401)
        return false;
    else
        return true;
}

async function fetchAdminPassword() {

    //We can abuse that the cgi exposes a function to read files from the ONU, that is accessible via the guest user, to get the admin password
    let config = await fetch(`http://${ONU_IP}/cgi/getfile?path=%2Fvar%2Fconfig%2Fmib.conf`, {
        headers: {
            'method': 'GET',
            'Authorization': 'Basic Z3Vlc3Q6Z3Vlc3Q=' //Guest account
        }
    }).then(response => {
        return response.text();
    }).catch(() => { //Don't care what went wrong
        return null;
    });

    if(config == null)
        return null;
    
    let passwordLine = /set\sUser\sUsername\sadmin\sPassword\s(.*)/g.exec(config);
    if(passwordLine == null)
        return null;

    //Returns the 1st capture group, that should contain the password
    return passwordLine[1];
}

async function getONU() {

    let response = await fetch(`http://${ONU_IP}/cgi/get_onu`, {
        headers: {
            'method': 'GET',
            'Authorization': `Basic ${Buffer.from(ONU_USER + ':' + ONU_PASS).toString('base64')}`
        }
    }).then(response => {
        return response.text();
    }).catch(() => { //Don't care what went wrong
        return null;
    });

    if(response == null)
        return null;

    //We need to sanitize the JSON (Thx to https://stackoverflow.com/a/9638723, saved me a bunch of time)
    return JSON.parse(response.replace(/([a-z][^,:]*)(?=\s*:)/gi, '"$1"'));
}

function convertModemIDToSN(modemid) {

    let captureGroups = /^([0-9A-F]{2})([0-9A-F]{2})\s([0-9A-F]{2})([0-9A-F]{2})\s([0-9A-F]{4})\s([0-9A-F]{4})$/.exec(modemid);
    let sn = String.fromCharCode(parseInt(captureGroups[1], 16));
    sn += String.fromCharCode(parseInt(captureGroups[2], 16));
    sn += String.fromCharCode(parseInt(captureGroups[3], 16));
    sn += String.fromCharCode(parseInt(captureGroups[4], 16));
    sn += captureGroups[5];
    sn += captureGroups[6];
    return sn;
}

async function setONU(loid, fec) {

    //Change the SN
    let response = await fetch(`http://${ONU_IP}/cgi/set_onu?loid=${loid}&fec=${fec}`, {
        headers: {
            'method': 'GET',
            'Authorization': `Basic ${Buffer.from(ONU_USER + ':' + ONU_PASS).toString('base64')}`
        }
    }).then(response => {
        return response.text();
    }).catch(() => { //Don't care what went wrong
        return null;
    });

    if(response == null || response != '1') //No success
        return 1;

    //Check if the SN has changed
    if((await getONU()).sn != loid) //If our SN hasn't changed, we failed in setting it
        return 2;

    //Save the config (I'm not even sure if this is needed tbh)
    response = await fetch(`http://${ONU_IP}/cgi/set_save`, {
        headers: {
            'method': 'GET',
            'Authorization': `Basic ${Buffer.from(ONU_USER + ':' + ONU_PASS).toString('base64')}`
        }
    }).then(response => {
        return response.text();
    }).catch(() => { //Don't care what went wrong
        return null;
    });

    if(response == null || response != '1') //No success
        return 3;

    //Reboot the ONU
    response = await fetch(`http://${ONU_IP}/cgi/reset_onu`, {
        headers: {
            'method': 'GET',
            'Authorization': `Basic ${Buffer.from(ONU_USER + ':' + ONU_PASS).toString('base64')}`
        }
    });

    return 0;
}

//---------------------------------------
//Main
//---------------------------------------

async function main() {

    //Important ASCII Art
    console.log('                               /$$                                              \r\n                              | $$                                              \r\n  /$$$$$$$ /$$$$$$$   /$$$$$$$| $$$$$$$   /$$$$$$  /$$$$$$$   /$$$$$$   /$$$$$$ \r\n /$$_____/| $$__  $$ /$$_____/| $$__  $$ |____  $$| $$__  $$ /$$__  $$ /$$__  $$\r\n|  $$$$$$ | $$  \\ $$| $$      | $$  \\ $$  /$$$$$$$| $$  \\ $$| $$  \\ $$| $$$$$$$$\r\n \\____  $$| $$  | $$| $$      | $$  | $$ /$$__  $$| $$  | $$| $$  | $$| $$_____/\r\n /$$$$$$$/| $$  | $$|  $$$$$$$| $$  | $$|  $$$$$$$| $$  | $$|  $$$$$$$|  $$$$$$$\r\n|_______/ |__/  |__/ \\_______/|__/  |__/ \\_______/|__/  |__/ \\____  $$ \\_______/\r\n                                                             /$$  \\ $$          \r\n                                                            |  $$$$$$/          \r\n                                                             \\______/           ');
    console.log('\r\n================================================================================\r\n');
    console.log('DISCLAIMER: Use at your own risk, the author is not liable for any damage!');
    console.log('By continuing, you accept the risk that you may damage your hardware.');


    //Step 1: Make sure the ONU is pingable
    process.stdout.write(`[1] Checking connectivity to ${ONU_IP}.. `);

    if(!(await onuReachable(ONU_IP))) {
        process.stdout.write('\x1b[31m');
        console.log('FAILURE');
        process.stdout.write('\x1b[0m');
        
        //Maybe the IP was changed?
        let newIP = (await getUserInput('If your ONU has a different IP, please provide it: '));
        while(!net.isIPv4(newIP)) //Is what the user entered really a IPv4?
            newIP = (await getUserInput('Please provide a valid IPv4 address: '));
        ONU_IP = newIP;

        process.stdout.write(`[1.1] Checking connectivity to ${ONU_IP}.. `);
        if(!(await onuReachable(ONU_IP))) {
            process.stdout.write('\x1b[31m');
            console.log('FAILURE');
            process.stdout.write('\x1b[0m');
            rl.close();
            process.exit(1);
        }
    }
    process.stdout.write('\x1b[32m');
    console.log('SUCCESS');
    process.stdout.write('\x1b[0m');
    console.log();


    //Step 2: Check if admin account has expected password
    process.stdout.write(`[2] Trying to log in to ONU using ${ONU_USER}:${ONU_PASS}.. `);

    if(!(await credentialsValid(ONU_USER, ONU_PASS))) {
        process.stdout.write('\x1b[31m');
        console.log('FAILURE');
        process.stdout.write('\x1b[0m');

        process.stdout.write(`[2.1] Trying to fetch admin password using guest account.. `);
        ONU_PASS = await fetchAdminPassword();

        if(ONU_PASS == null) {
            process.stdout.write('\x1b[31m');
            console.log('FAILURE');
            process.stdout.write('\x1b[0m');
            rl.close();
            process.exit(1);
        }else {
            process.stdout.write('\x1b[32m');
            console.log('SUCCESS');
            process.stdout.write('\x1b[0m');
            console.log(`Your ONU's admin password is '${ONU_PASS}', if you want to write it down.`);
            console.log();
        }
    }else {
        process.stdout.write('\x1b[32m');
        console.log('SUCCESS');
        process.stdout.write('\x1b[0m');
        console.log();
    }

    //Step 3: Get current ONU details & back up the original serial number
    process.stdout.write(`[3] Pulling current serial number.. `);

    let onuData = await getONU();
    if(onuData == null) {
        process.stdout.write('\x1b[31m');
        console.log('FAILURE');
        process.stdout.write('\x1b[0m');
        rl.close();
        process.exit(1);
    }
    process.stdout.write('\x1b[32m');
    console.log('SUCCESS');
    process.stdout.write('\x1b[0m');

    fs.closeSync(fs.openSync(`${onuData.sn}.old`, 'w'));
    console.log(`[3.1] Backed up the old serial number to '${onuData.sn}.old'`);
    console.log();

    //Step 4: Replacing serial number with user provided number
    console.log('[4] Please provide the new SN or Modem-ID you wish to set on your ONU.');
    console.log('Format (Modem-ID): XXXX XXXX XXXX XXXX (16 Characters in blocks of 4 | Example: A123 4B56 78C9 101D)');
    console.log('Format (SN): XXXXXXXXXXXX (12 Characters | ZYWN123A456B)');

    let snInput = (await getUserInput('New SN/Modem-ID: '));
    let newSN = null;
    
    while(newSN == null)
        if(snInput.match(/^([0-9A-F]{2})([0-9A-F]{2})\s([0-9A-F]{2})([0-9A-F]{2})\s[0-9A-F]{4}\s[0-9A-F]{4}$/)) { //Is Modem-ID?
            newSN = convertModemIDToSN(snInput);
        }else if(snInput.match(/^[0-9A-Z]{4}[0-9A-F]{8}$/)) { //Is SN?
            newSN = snInput;
        }else { //Retry
            process.stdout.write('\x1b[31m');
            console.log('Format not recognized!');
            process.stdout.write('\x1b[0m');
            snInput = (await getUserInput('New SN/Modem-ID: '));
        }

    process.stdout.write('[4.1] Writing the new SN to the ONU.. ');
    let setSNSuccess = await setONU(newSN, onuData.fec_en);
    if(setSNSuccess == 1) {
        process.stdout.write('\x1b[31m');
        console.log('FAILURE');
        console.log('/cgi/set_onu failed!');
        process.stdout.write('\x1b[0m');
    }else if(setSNSuccess == 2) {
        process.stdout.write('\x1b[31m');
        console.log('FAILURE');
        console.log('New SN was set but not returned correctly by /cgi/get_onu!');
        process.stdout.write('\x1b[0m');
    }else if(setSNSuccess == 3) {
        process.stdout.write('\x1b[31m');
        console.log('FAILURE');
        console.log('Could not save the ONU config using /cgi/set_save!');
        process.stdout.write('\x1b[0m');
    }
    if(setSNSuccess == 0) {
        process.stdout.write('\x1b[32m');
        console.log('SUCCESS');
        process.stdout.write('\x1b[0m');
        console.log();
    }else {
        rl.close();
        process.exit(1);
    }

    //Step 5: Waiting for ONU reboot
    process.stdout.write(`[5] Waiting for ONU reboot.. `);

    while(!(await onuReachable(ONU_IP)))
        await new Promise(promise => setTimeout(promise, 10000)); //Sleep for 10s to not spam too many pings

    process.stdout.write('\x1b[32m');
    console.log('SUCCESS');
    process.stdout.write('\x1b[0m');
    console.log();

    //Step 6: Verify ONU SN
    process.stdout.write(`[6] Verifying SN change success.. `);

    if((await getONU()).sn != newSN) {
        process.stdout.write('\x1b[31m');
        console.log('FAILURE');
        process.stdout.write('\x1b[0m');
        rl.close();
        process.exit(1);
    }
    process.stdout.write('\x1b[32m');
    console.log('SUCCESS');
    process.stdout.write('\x1b[0m');
    console.log();

    console.log('Your ONU\'s serial number was changed successfully! Please verify using the \'GPON Line Status\' and \'LOID Auth Status\' in the web interface.');

    rl.close();
    process.exit(0);
}

//Run script
main().catch(console.error);