// Global guard: every route requires a signed-in user unless marked @Public().
// @RequirePermission('x') additionally checks a platform permission (organisation-scoped checks use canForOrg).
import { createParamDecorator, type CanActivate, type ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Problem } from '../../platform/problem.js';
import type { Actor } from './actor.js';
import { AuthError, AuthService } from './auth.service.js';

const IS_PUBLIC = 'sazo:isPublic';
const PERMISSION = 'sazo:permission';

/** Route needs no sign-in. A valid token, if sent, is still read (so public pages can personalise). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION, permission);

/** The signed-in actor (undefined on public routes without a token). */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor | undefined =>
  ctx.switchToHttp().getRequest<Request & { actor?: Actor }>().actor);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request & { actor?: Actor }>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      try {
        req.actor = await this.auth.actorFromToken(token);
      } catch (err) {
        if (!isPublic) {
          const e = err as AuthError;
          throw new Problem(401, e.code ?? 'invalid_token', 'Unauthorized', e.message);
        }
      }
    }
    if (isPublic) return true;
    if (!req.actor) throw new Problem(401, 'authentication_required', 'Unauthorized', 'Sign in to continue');

    const permission = this.reflector.getAllAndOverride<string>(PERMISSION, [ctx.getHandler(), ctx.getClass()]);
    if (permission && !req.actor.permissions.has(permission)) {
      throw new Problem(403, 'forbidden', 'Forbidden', `Missing permission ${permission}`);
    }
    return true;
  }
}
