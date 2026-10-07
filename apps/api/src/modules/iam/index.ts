// Public interface of Identity & Access (module 1).
export { IamModule } from './iam.module.js';
export { AuthService, AuthError, type Tokens } from './auth.service.js';
export { IamService, BUSINESS_ORG_TYPES } from './iam.service.js';
export { Public, RequirePermission, CurrentActor } from './auth.guard.js';
export { can, canForOrg, type Actor, type OrgAccess } from './actor.js';
