import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { OriginCheckMiddleware } from './common/middleware/origin-check.middleware';
import { HealthController } from './health/health.controller';
import { AdminModule } from './modules/admin/admin.module';
import { CaseManagementModule } from './modules/case-management/case-management.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { PortalModule } from './modules/portal/portal.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { CrmModule } from './modules/crm/crm.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmploymentModule } from './modules/employment/employment.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { HousingModule } from './modules/housing/housing.module';
import { InsideClassesModule } from './modules/inside-classes/inside-classes.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { MentoringModule } from './modules/mentoring/mentoring.module';
import { OutsideProgramsModule } from './modules/outside-programs/outside-programs.module';
import { ParticipantsModule } from './modules/participants/participants.module';
import { PublicIntakeModule } from './modules/public-intake/public-intake.module';
import { ReportsModule } from './modules/reports/reports.module';
import { VolunteersModule } from './modules/volunteers/volunteers.module';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { SupportModule } from './modules/support/support.module';

@Module({
  imports: [
    SupportModule,
    MailModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    // Domain modules (§6.1–§6.14)
    ParticipantsModule,
    InstitutionsModule,
    InsideClassesModule,
    OutsideProgramsModule,
    HousingModule,
    CaseManagementModule,
    VolunteersModule,
    MentoringModule,
    CrmModule,
    EmploymentModule,
    FleetModule,
    PublicIntakeModule,
    CommunicationsModule,
    AttachmentsModule,
    PortalModule,
    DashboardModule,
    ReportsModule,
    AdminModule,
    // Global baseline rate limit; hot endpoints tighten with @Throttle.
    // Disabled under test — suites log in far more often than a human.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(OriginCheckMiddleware).forRoutes('*');
  }
}
