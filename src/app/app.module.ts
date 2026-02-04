import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicStorageModule } from '@ionic/storage-angular';

import { IonicModule, IonicRouteStrategy, isPlatform } from '@ionic/angular';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { PersonPageModule } from './people/person/person.module';
import { HistoryPageModule } from './history/history.module';
import { TeacherPageModule } from './teacher/teacher.module';
import { StatsPageModule } from './stats/stats.module';
import { ExportPageModule } from './export/export.module';
import { PlanningPageModule } from './planning/planning.module';
import { InstrumentPageModule } from './instruments/instrument/instrument.module';
import { AttendancePageModule } from './attendance/attendance/attendance.module';
import { TypePageModule } from 'src/app/settings/general/type/type.module';
import { popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios26';

@NgModule({
    declarations: [AppComponent],
    imports: [
        BrowserModule,
        IonicModule.forRoot({
            popoverEnter: isPlatform('ios') ? popoverEnterAnimation : undefined,
            popoverLeave: isPlatform('ios') ? popoverLeaveAnimation : undefined,
            swipeBackEnabled: true,
        }),
        AppRoutingModule,
        PersonPageModule,
        IonicStorageModule.forRoot(),
        HistoryPageModule,
        TeacherPageModule,
        StatsPageModule,
        ExportPageModule,
        PlanningPageModule,
        InstrumentPageModule,
        AttendancePageModule,
        TypePageModule,
    ],
    providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }],
    bootstrap: [AppComponent]
})
export class AppModule { }
