import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicStorageModule } from '@ionic/storage-angular';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AttPageModule } from './attendance/att/att.module';
import { PersonPageModule } from './people/person/person.module';
import { HistoryPageModule } from './history/history.module';
import { TeacherPageModule } from './teacher/teacher.module';
import { ProblemModalPageModule } from './people/problem-modal/problem-modal.module';
import { StatsPageModule } from './stats/stats.module';
import { ExportPageModule } from './export/export.module';
import { PlanningPageModule } from './planning/planning.module';
import { InstrumentPageModule } from './instruments/instrument/instrument.module';

@NgModule({
    declarations: [AppComponent],
    imports: [
        BrowserModule,
        IonicModule.forRoot(),
        AppRoutingModule,
        PersonPageModule,
        IonicStorageModule.forRoot(),
        AttPageModule,
        ProblemModalPageModule,
        HistoryPageModule,
        TeacherPageModule,
        StatsPageModule,
        ExportPageModule,
        PlanningPageModule,
        InstrumentPageModule,
    ],
    providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }],
    bootstrap: [AppComponent]
})
export class AppModule { }
