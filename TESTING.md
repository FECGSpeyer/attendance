# Testing Guide für Attendix

Dieses Dokument beschreibt die Testing-Infrastruktur für das Attendix-Projekt.

## Technologie-Stack

| Typ            | Technologie                            | Beschreibung                                  |
| -------------- | -------------------------------------- | --------------------------------------------- |
| **Unit Tests** | Vitest + @analogjs/vite-plugin-angular | Schnelle, moderne Test-Ausführung für Angular |
| **E2E Tests**  | Playwright                             | Cross-Browser E2E-Tests inkl. Mobile          |
| **Mocking**    | Vitest Mocks                           | Mocking von Services, Supabase, Capacitor     |
| **Coverage**   | @vitest/coverage-v8                    | Code Coverage Reports                         |

## NPM Scripts

```bash
# Unit Tests
npm run test              # Alle Tests einmal ausführen
npm run test:watch        # Tests im Watch-Mode
npm run test:ui           # Vitest UI öffnen
npm run test:coverage     # Tests mit Coverage-Report

# E2E Tests
npm run e2e               # E2E Tests ausführen
npm run e2e:ui            # Playwright UI Mode
npm run e2e:headed        # Mit sichtbarem Browser
npm run e2e:debug         # Debug-Mode
npm run e2e:codegen       # Test-Generator starten
```

## Projektstruktur

```
src/
├── testing/                    # Test-Utilities
│   ├── factories/              # Test-Daten Factories
│   │   └── entity.factory.ts   # Player, Tenant, Attendance etc.
│   ├── mocks/                  # Service Mocks
│   │   ├── supabase.mock.ts    # Supabase Client Mock
│   │   ├── db-service.mock.ts  # DbService Mock
│   │   ├── ionic.mock.ts       # Ionic Controller Mocks
│   │   └── capacitor.mock.ts   # Capacitor Plugin Mocks
│   └── helpers/                # Test Helpers
│       └── component-test.helper.ts
├── app/
│   └── **/*.spec.ts            # Unit Tests
e2e/
├── specs/                      # E2E Test Specs
├── pages/                      # Page Objects
└── fixtures/                   # Test Fixtures
```

## Unit Tests schreiben

### Einfacher Service Test

```typescript
import { TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach } from "vitest";
import { DataService } from "./data.service";

describe("DataService", () => {
  let service: DataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DataService],
    });
    service = TestBed.inject(DataService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });
});
```

### Component Test mit Mocks

```typescript
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach } from "vitest";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { RouterTestingModule } from "@angular/router/testing";
import { IonicModule } from "@ionic/angular";
import { FormsModule } from "@angular/forms";
import { MyPage } from "./my.page";
import { createDbServiceMock } from "../../testing/mocks/db-service.mock";
import { DbService } from "../services/db.service";

describe("MyPage", () => {
  let component: MyPage;
  let fixture: ComponentFixture<MyPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [MyPage],
      imports: [IonicModule.forRoot(), RouterTestingModule, FormsModule],
      providers: [{ provide: DbService, useValue: dbServiceMock }],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(MyPage);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
```

### Test Factories verwenden

```typescript
import { createPlayer, createAttendance, createTenant } from "../../testing/factories/entity.factory";

describe("Player Tests", () => {
  it("should create player with defaults", () => {
    const player = createPlayer();
    expect(player.firstName).toContain("FirstName");
  });

  it("should create player with overrides", () => {
    const player = createPlayer({
      firstName: "Max",
      lastName: "Mustermann",
      instrument: 5,
    });
    expect(player.firstName).toBe("Max");
    expect(player.instrument).toBe(5);
  });
});
```

## E2E Tests schreiben

### Page Object Pattern

```typescript
// e2e/pages/login.page.ts
import { Page } from "@playwright/test";

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  get emailInput() {
    return this.page.locator('ion-input[type="email"] input');
  }

  get passwordInput() {
    return this.page.locator('ion-input[type="password"] input');
  }

  get loginButton() {
    return this.page.locator('ion-button:has-text("Anmelden")');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
```

### E2E Test Spec

```typescript
import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";

test.describe("Login Flow", () => {
  test("should display login form", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
  });
});
```

## Coverage Ziele

| Bereich    | Ziel | Status         |
| ---------- | ---- | -------------- |
| Services   | 40%  | 🔄 In Progress |
| Utilities  | 40%  | ✅ Gestartet   |
| Components | 20%  | 🔄 In Progress |
| Guards     | 30%  | 📋 Geplant     |

## Tipps

### Ionic Components

- Verwende `CUSTOM_ELEMENTS_SCHEMA` um Ionic-Component-Warnings zu vermeiden
- Importiere `IonicModule.forRoot()` für Ionic-Services
- Für Forms: `FormsModule` oder `ReactiveFormsModule` importieren

### Async Tests

```typescript
it("should load data", async () => {
  dbServiceMock.playerSvc.getPlayers.mockResolvedValue([createPlayer()]);

  await component.loadPlayers();

  expect(component.players.length).toBe(1);
});
```

### Capacitor Mocks

Capacitor-APIs funktionieren nicht im Browser. Verwende die Mocks aus `testing/mocks/capacitor.mock.ts`:

```typescript
import { HapticsMock } from "../../testing/mocks/capacitor.mock";

vi.mock("@capacitor/haptics", () => ({ Haptics: HapticsMock }));
```

## Troubleshooting

### "Export of name 'ngForm' not found"

→ `FormsModule` importieren

### "Cannot read properties of undefined (reading 'tenant')"

→ `createDbServiceMock()` mit Tenant-Daten verwenden

### Ionic Animation Errors

→ `CUSTOM_ELEMENTS_SCHEMA` verwenden und `happy-dom` Environment

## Nächste Schritte

1. Fehlende Page-Tests mit DbService-Mocks aktualisieren
2. E2E-Tests für kritische Flows schreiben (Login, Attendance)
3. GitHub Actions CI/CD Pipeline hinzufügen
4. Coverage-Thresholds schrittweise erhöhen
