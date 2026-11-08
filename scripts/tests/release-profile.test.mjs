import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('existing-hosting profile selects the non-trading entry, public bind and matching private origin authentication without automatic migrations',async()=>{
 const profile=JSON.parse(await readFile('deploy/application/nontrading-profile.json','utf8')),pkg=JSON.parse(await readFile('artifacts/api-server/package.json','utf8'));
 assert.equal(profile.replaceInfrastructure,false);assert.equal(profile.financialExecution,false);assert.equal(profile.automaticDeployment,false);assert.equal(profile.listenHost,'0.0.0.0');
 assert.match(profile.buildCommand,/--frozen-lockfile/);assert.match(profile.buildCommand,/--ignore-scripts/);assert.match(profile.buildCommand,/build:application-nontrading/);assert.match(pkg.scripts['start:application-nontrading'],/release-nontrading\/application-nontrading\.mjs/);
 assert.doesNotMatch(pkg.scripts['start:application-nontrading'],/migration|index\.mjs/);assert.equal(profile.releaseFlags.EA_RELEASE_MODE,'nontrading');assert.equal(profile.releaseFlags.MT5_ACCESS_REQUIRED,'1');
});
