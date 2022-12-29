import { driveactivity_v2, drive_v3, google } from 'googleapis';

import { GaxiosResponse } from "gaxios";

// ######################
// Configuration variables
const driveId = 'YOUR_DRIVE_ID'; // You can find the Drive ID in the URL when opening the root folder
const cutoffDate = new Date(2022, 11, 15); // Set the day before the virus started to encrypt the files
const infectedUserDisplayName = 'Mario Rossi'; // Set the name (as registered in Google Drive) of the account that synced the encrypted files
const loginKeyPath = '../keys/your-key.json'; // Set the path of the key of the Service Account you created

// This needs to be set to `true` to actually recover the files, otherwise
// the script will go through all the files without recovering anything.
const enableDangerousActions = true;

const key = require(loginKeyPath);

const client = new google.auth.JWT(
    key.client_email,
    undefined,
    key.private_key,
    [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.activity'
    ]
);

client.authorize((err, tokens) => {
    if (err) {
        console.log(err);
        return;
    } else {
        console.log('Connected to Google API');
    }
});

const drive = google.drive({ version: 'v3', auth: client });
const driveactivity = google.driveactivity({version: 'v2', auth: client});

drive.drives.list((error, response) => {
    if (error) {
        console.log(error);
    } else if (response) {
        const drives = response.data.drives;
        if (drives !== undefined) {
            console.log(`Found ${drives.length} drive(s)`);
            const selectedDrive = drives.find((element) => element.id == driveId);

            if (selectedDrive !== undefined) {
                console.log(`Selected drive: ${selectedDrive.name}`);
            } else {
                console.log(JSON.stringify(drives))
            }
        }
    } else {
        console.error("Empty response");
        return;
    }
});

async function recoverFiles() {
    let nextPageToken: string | undefined = undefined;
    do {
        try {

            let response: GaxiosResponse<drive_v3.Schema$FileList> = await drive.files.list({
                corpora: 'drive',
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
                driveId: driveId,
                pageToken: nextPageToken,
                q: `modifiedTime > '${cutoffDate.toISOString()}' and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'nextPageToken, files(id, name, createdTime, modifiedTime, trashed, parents)',
            });

            const files = response.data.files;
            if (files !== undefined) {
                console.log(`Found ${files.length} file(s) with revisions newer than ${cutoffDate.toISOString()}`);
            } else {
                console.warn('Empty file list');
                continue
            }


            for (const file of files) {
                let fileId = file.id
                if (typeof fileId !== 'string') {
                    continue
                } else {

                    // ######################
                    // File identification
                    let parentFolderName = ''

                    let parendsNames: string[] = []
                    for (const parent of file.parents ?? []) {
                        let firstParentId = parent

                        let parentResponse = await drive.files.get({
                            fileId: firstParentId,
                            supportsAllDrives: true,
                            fields: 'name',
                        });
                        parendsNames.push(parentResponse.data.name ?? '')
                    }
                    parentFolderName = parendsNames.join(', ')

                    console.log(`Handling ${file.name} (in ${parentFolderName} (${file.parents?.length} parents), trashed: ${file.trashed})`);

                    // ######################
                    // Delete ransomware files
                    if (file.name === 'Help_me_for_Decrypt.hta' || file.name === 'How To Restore Your Files.txt') {
                        console.log(`    File name is ${file.name}. Deleting it.`);

                        if (enableDangerousActions) {
                            await drive.files.update({
                                fileId: fileId,
                                supportsAllDrives: true,
                                requestBody: {
                                    trashed: true
                                }
                            });

                            /*
                            // Permanently delete the file
                            // See https://issuetracker.google.com/u/2/issues/238902713?pli=1
                            // https://developers.google.com/drive/api/guides/v2-to-v3-reference
                            await drive.files.delete({
                                fileId: fileId,
                                supportsAllDrives: true
                            });
                            */
                            console.log(`    ${file.name} deleted.`);
                        }

                        continue
                    }

                    // ######################
                    // Revisions
                    let revisionResponse = await drive.revisions.list({
                        fileId: fileId,
                        fields: 'nextPageToken, revisions(id, modifiedTime, originalFilename, lastModifyingUser)',
                    });
                    if (revisionResponse.data.nextPageToken !== null && revisionResponse.data.nextPageToken !== undefined) {
                        console.warn('  Unhandled page of revisions!')
                    }

                    const revisions = revisionResponse.data.revisions ?? [];
                    console.log(`    Found ${revisions.length} revision(s)`);
                    let recentRevisions = revisions.filter((revision) => {
                        let modifiedTime = revision.modifiedTime
                        if (modifiedTime) {
                            const modifiedDate = new Date(Date.parse(modifiedTime));
                            return modifiedDate > cutoffDate
                        } else {
                            return true
                        }
                    });

                    for (const recRevision of recentRevisions) {
                        let modifiedTime = recRevision.modifiedTime;
                        let modifiedDate = new Date();
                        let modifiedTimeString = ''
                        if (modifiedTime) {
                            modifiedDate = new Date(Date.parse(modifiedTime));
                            modifiedTimeString = modifiedDate.toISOString();
                        }

                        let revisionId = recRevision.id;
                        if (revisionId && recRevision.lastModifyingUser?.displayName === infectedUserDisplayName && modifiedDate > cutoffDate) {
                            console.log(`    Found incriminated revision by ${recRevision.lastModifyingUser?.displayName} (${recRevision.lastModifyingUser?.emailAddress}) on ${modifiedTimeString}`);

                            if (enableDangerousActions) {
                                await drive.revisions.delete({
                                    fileId: fileId,
                                    revisionId: revisionId
                                })
                                console.log(`    Deleted revision ${recRevision.id}`);
                            }
                            
                        } else {
                            console.warn(`    Found revision by ${recRevision.lastModifyingUser?.displayName} (${recRevision.lastModifyingUser?.emailAddress}) on ${modifiedTimeString} not matching criteria`);
                        }
                    }
                    

                    // ######################
                    // Activites
                    let nextPageTokenActivity: string | undefined = undefined;
                    let fileActivities: driveactivity_v2.Schema$DriveActivity[] = []
                    do {
                        const renameChanges: GaxiosResponse<driveactivity_v2.Schema$QueryDriveActivityResponse> = await driveactivity.activity.query({
                            requestBody: {
                                pageToken: nextPageTokenActivity,
                                itemName: `items/${fileId}`,
                                filter: `time > "${cutoffDate.toISOString()}" AND detail.action_detail_case: RENAME`
                            }
                        });

                        fileActivities.push(...(renameChanges.data.activities ?? []));

                        nextPageTokenActivity = renameChanges.data.nextPageToken ?? undefined
                    } while (typeof nextPageTokenActivity !== 'undefined');

                    console.log(`    Found ${fileActivities.length} rename activity/activities.`)
                    let incrinimatedAction: driveactivity_v2.Schema$Rename | null = null
                    for (const activity of fileActivities) {
                        let renameAction = activity.primaryActionDetail?.rename
                        if (renameAction) {
                            console.log(`    Found rename action from '${renameAction.oldTitle}' to '${renameAction.newTitle}'. ${activity.actions?.length} sub-actions.`);

                            if (renameAction.newTitle?.includes('.hardbit2')) {
                                incrinimatedAction = renameAction
                            }
                            /*
                            console.log('    Sub activities:')
                            for (const subActivity of activity.actions ?? []) {
                                let subActivityDetail = subActivity.detail
                                if (subActivityDetail) {
                                    console.log(`      ${JSON.stringify(subActivityDetail)}`);
                                } else {
                                    console.log(`      No detail`);
                                }
                            }
                            */
                        } else {
                            console.log(`    Primary action is not 'rename' action. ${activity.actions?.length} sub-actions.`);
                        }

                        if (incrinimatedAction !== null) {
                            if (file.name?.includes('.hardbit2')) {
                                if (enableDangerousActions) {
                                    await drive.files.update({
                                        fileId: fileId,
                                        supportsAllDrives: true,
                                        requestBody: {
                                            name: incrinimatedAction.oldTitle
                                        }
                                    });
    
                                    console.log(`    File renamed to '${incrinimatedAction.oldTitle}'`);
                                }
                            } else {
                                console.log(`    File (probably) already renamed.`);
                            }
                            

                        }
                    }

                }
            }

            nextPageToken = response.data.nextPageToken ?? undefined;
        } catch (error) {
            console.error(error);
        }

    } while (typeof nextPageToken !== 'undefined');

    console.log('Finished!');
}

recoverFiles();