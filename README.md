# Recover HARDBIT 2 - Google Drive - Shared Drives

The scripts help the recover of the files in a Shared Drive on Google Drive (Google Workspace) after they have been encrypted by Hardbit 2 Ransomware.

The ransomware encrypt and rename the files, but thanks to Google Drive's version history and activity record, recovering the files is as ease as deleting the revisions of the files that are more recent than when the virus started to attack the documents and revert the rename action.

## How use the script

First, create a Google Cloud Service account at https://console.cloud.google.com/iam-admin/serviceaccounts and share the Shared Drive you want to recover with the Service Account you just created.
Download the file JSON with the key of the account, we'l use that for authentication in the script.

Then, on your machine:

- Make sure to have Node.js installed;
- Open the file `src/index.ts` and change the configuration variables at the beginning of the file: every variable in that section must be set to your value. After you configured all of them, try to run the script with `enableDangerousActions = false` to check that everything is working without modifying the drive. If everything looks fine, you can set `enableDangerousActions = true` and proceed;
- Open your Terminal, move to the folder of the project and run the following commanf to install the packages needed to run the script:

        npm install

- Compile the TypeScript files with 

        npx tsc
    and run the file with the command

        node ./build/index.js

### Note
The script assume that no relevant change to the Shared Drive has been made after the virus attacked the files - it will delete every change made after the 'cut-off date'.

The script can be adapted to work with 'My Drive' instead of 'Shared Drives', but that was not needed for me and so I didn't spend time on that. The main issue is that the current implementation uses a Service Account instead of the normal user account.

I am not liable of any data loss. The script has been shared to allow other professional developers to have something to start from if they need to recover files encrypted by Hardbit 2 Ransomware. It's supposed to be used only by developers that fully understand what the script does.