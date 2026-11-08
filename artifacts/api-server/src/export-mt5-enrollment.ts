import {exportEnrollment} from './lib/enrollment-export';
async function main(){
 if(process.env.EA_ENROLLMENT_EXPORT!=='1'||!process.env.EA_ENROLLMENT_REQUEST_ID||!process.env.EA_ENROLLMENT_EXPORT_PATH)throw Error('Explicit private operator export required');
 const {pool}=await import('@workspace/db');
 try{await exportEnrollment(pool,process.env.EA_ENROLLMENT_REQUEST_ID,process.env.EA_ENROLLMENT_EXPORT_PATH);process.stdout.write('Private demo enrollment handoff created; no provisioning or execution performed.\n');}finally{await pool.end();}
}
void main().catch(()=>{process.stderr.write('Enrollment export refused; check private selectors, ownership and original encryption binding.\n');process.exitCode=1;});
