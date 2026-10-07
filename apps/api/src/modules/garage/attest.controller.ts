// The owner-confirmation page's API (D-058). No sign-in: the single-use link IS the credential.
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { Public } from '../iam/index.js';
import { AttestationError, AttestationsService } from '../obs/index.js';
import { GarageService } from './garage.service.js';

const Token = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);
const Answer = z.object({ response: z.enum(['confirmed', 'disputed']), comment: z.string().trim().max(500).optional() });

@Controller('attest')
export class AttestController {
  constructor(
    @Inject(GarageService) private readonly garage: GarageService,
    @Inject(AttestationsService) private readonly attestations: AttestationsService,
  ) {}

  /** GET /v1/attest/:token — what the customer is asked to confirm (operationId getAttestationRequest). */
  @Public()
  @Get(':token')
  async get(@Param('token') token: string) {
    const found = Token.safeParse(token).success ? await this.garage.attestationView(token) : undefined;
    if (!found) throw notFound('link_not_found', 'This link is not valid');
    if (new Date(found.request.expiresAt).getTime() < Date.now() && !found.request.answer) throw new Problem(410, 'link_expired', 'Gone', 'This link has expired');
    return found.view;
  }

  /** POST /v1/attest/:token — confirm or dispute, once (operationId answerAttestationRequest). */
  @Public()
  @Post(':token')
  @HttpCode(204)
  async answer(@Param('token') token: string, @Body() body: unknown) {
    if (!Token.safeParse(token).success) throw notFound('link_not_found', 'This link is not valid');
    const b = Answer.safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'response must be confirmed or disputed');
    try {
      await this.attestations.answer(token, b.data.response, b.data.comment);
    } catch (err) {
      if (err instanceof AttestationError) {
        if (err.code === 'not_found') throw notFound('link_not_found', err.message);
        if (err.code === 'expired') throw new Problem(410, 'link_expired', 'Gone', err.message);
        throw new Problem(409, 'already_answered', 'Conflict', err.message);
      }
      throw err;
    }
  }
}
