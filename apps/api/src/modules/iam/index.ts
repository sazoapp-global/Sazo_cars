// Public interface of Identity & Access (module 1).
export { IamModule } from './iam.module.js';
export { AuthService, AuthError, type Tokens, type LoginResult } from './auth.service.js';
export { authProblem } from './auth.controller.js';
export { IamService, BUSINESS_ORG_TYPES } from './iam.service.js';
export { Public, RequirePermission, CurrentActor } from './auth.guard.js';
export { can, canForOrg, type Actor, type OrgAccess } from './actor.js';
export { BrokersService, BrokerApplicationError, type BrokerApplicationView } from './brokers.service.js';
export { IdentityService, IdentityError, NIN_PATTERN, type IdentityCheckView } from './identity.service.js';
