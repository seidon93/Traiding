"""
Financial Controlling Dataset Generator
========================================
Generates a comprehensive, realistic financial dataset for controlling purposes.
Covers: transactions, cost centers, projects, profit centers, regions, branches,
employees (HR), products, customers, suppliers, sales, purchases, production,
cash flow, budgets, and payroll.

Output: CSV files in ./financial_dataset/
"""

import os
import random
import datetime
import numpy as np
import pandas as pd
from faker import Faker

fake = Faker('cs_CZ')
Faker.seed(42)
np.random.seed(42)
random.seed(42)

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'financial_dataset')
os.makedirs(OUTPUT_DIR, exist_ok=True)

DATE_START = datetime.date(2023, 1, 1)
DATE_END = datetime.date(2025, 12, 31)
TOTAL_DAYS = (DATE_END - DATE_START).days + 1

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def random_dates(n, start=DATE_START, end=DATE_END):
    days = np.random.randint(0, (end - start).days + 1, size=n)
    return [start + datetime.timedelta(int(d)) for d in days]

def seasonal_dates(n, start=DATE_START, end=DATE_END):
    """Generate dates with seasonal bias (more in Q4, less in Q1)."""
    total = (end - start).days + 1
    weights = []
    for d in range(total):
        dt = start + datetime.timedelta(d)
        month = dt.month
        if month in (10, 11, 12):
            w = 1.6
        elif month in (7, 8, 9):
            w = 1.1
        elif month in (4, 5, 6):
            w = 1.0
        else:
            w = 0.7
        weights.append(w)
    weights = np.array(weights)
    weights /= weights.sum()
    days = np.random.choice(total, size=n, p=weights)
    return [start + datetime.timedelta(int(d)) for d in days]

def save(df, name):
    path = os.path.join(OUTPUT_DIR, name)
    df.to_csv(path, index=False, encoding='utf-8-sig')
    print(f"  ✓ {name}: {len(df):>10,} rows, {len(df.columns):>3} cols")
    return df

# ============================================================
# 1. DIMENSION TABLES
# ============================================================

def gen_regiony():
    data = [
        ('REG01', 'Praha', 'CZ'), ('REG02', 'Středočeský', 'CZ'),
        ('REG03', 'Jihomoravský', 'CZ'), ('REG04', 'Moravskoslezský', 'CZ'),
        ('REG05', 'Plzeňský', 'CZ'), ('REG06', 'Královéhradecký', 'CZ'),
        ('REG07', 'Olomoucký', 'CZ'), ('REG08', 'Liberecký', 'CZ'),
        ('REG09', 'Bratislava', 'SK'), ('REG10', 'Wien', 'AT'),
    ]
    return save(pd.DataFrame(data, columns=['region_id','region_nazev','zeme']), 'dim_regiony.csv')

def gen_pobocky(regiony):
    rows = []
    mesta = {
        'REG01': ['Praha 1','Praha 4','Praha 8'],
        'REG02': ['Kladno','Mladá Boleslav','Kolín'],
        'REG03': ['Brno-střed','Brno-sever','Znojmo'],
        'REG04': ['Ostrava','Frýdek-Místek','Opava'],
        'REG05': ['Plzeň','Klatovy','Rokycany'],
        'REG06': ['Hradec Králové','Trutnov','Náchod'],
        'REG07': ['Olomouc','Přerov','Šumperk'],
        'REG08': ['Liberec','Jablonec','Česká Lípa'],
        'REG09': ['Bratislava I','Bratislava III','Pezinok'],
        'REG10': ['Wien Zentrum','Wien Nord','Wien Süd'],
    }
    for i, (rid, cities) in enumerate(mesta.items()):
        for j, city in enumerate(cities):
            pid = f'POB{i*3+j+1:02d}'
            rows.append((pid, f'Pobočka {city}', fake.street_address(), city, rid,
                          random.choice(['aktivní','aktivní','aktivní','plánovaná'])))
    return save(pd.DataFrame(rows, columns=['pobocka_id','pobocka_nazev','adresa','mesto','region_id','stav']),
                'dim_pobocky.csv')

def gen_strediska(pobocky):
    typy = ['Výroba','Obchod','Administrativa','IT','Logistika','Finance','Marketing','HR','Kvalita','R&D']
    rows = []
    for i in range(50):
        sid = f'STR{i+1:03d}'
        typ = typy[i % len(typy)]
        parent = f'STR{random.randint(1, max(1, i)):03d}' if i > 0 else None
        pob = random.choice(pobocky['pobocka_id'].tolist())
        rows.append((sid, f'{typ} - oddělení {i+1}', typ, parent, pob,
                      random.choice(['aktivní','aktivní','neaktivní'])))
    return save(pd.DataFrame(rows, columns=['stredisko_id','stredisko_nazev','typ','nadrazene_stredisko','pobocka_id','stav']),
                'dim_strediska.csv')

def gen_profit_centra(regiony):
    rows = []
    nazvy = ['Retail CZ','Wholesale CZ','E-commerce','B2B International','Services CZ',
             'Retail SK','Manufacturing','Consulting','Logistics','Financial Services',
             'IT Solutions','Custom Products','Maintenance','After-sales','Export EU',
             'Government','Energy','Healthcare','Automotive','Ostatní']
    for i in range(20):
        rows.append((f'PC{i+1:02d}', nazvy[i], random.choice(regiony['region_id'].tolist()),
                      fake.name(), random.choice(['aktivní','aktivní','neaktivní']),
                      round(random.uniform(500000, 50000000), 2)))
    return save(pd.DataFrame(rows, columns=['profit_centrum_id','nazev','region_id','manazer','stav','rocni_cil']),
                'dim_profit_centra.csv')

def gen_projekty():
    stavy = ['Plánovaný','Aktivní','Aktivní','Aktivní','Pozastavený','Dokončený','Zrušený']
    rows = []
    for i in range(100):
        start = DATE_START + datetime.timedelta(random.randint(0, 800))
        end = start + datetime.timedelta(random.randint(30, 730))
        rows.append((f'PROJ{i+1:03d}', fake.catch_phrase()[:50], random.choice(stavy),
                      round(random.uniform(50000, 5000000), 2), start, end,
                      random.choice(['Interní','Zákaznický','R&D','Investiční','Údržba'])))
    return save(pd.DataFrame(rows, columns=['projekt_id','projekt_nazev','stav','rozpocet','datum_zahajeni','datum_ukonceni','typ']),
                'dim_projekty.csv')

def gen_ucty():
    """Full Czech chart of accounts (účtový rozvrh) per ČÚS."""
    accounts = [
        # Třída 0 – Dlouhodobý majetek
        ('011','Nehmotné výsledky vývoje','Aktiva','01 DNM','0'),
        ('012','Software','Aktiva','01 DNM','0'),
        ('013','Ocenitelná práva','Aktiva','01 DNM','0'),
        ('014','Goodwill','Aktiva','01 DNM','0'),
        ('015','Povolenky na emise','Aktiva','01 DNM','0'),
        ('017','Preferenční limity','Aktiva','01 DNM','0'),
        ('019','Ostatní DNM','Aktiva','01 DNM','0'),
        ('021','Stavby','Aktiva','02 DHM','0'),
        ('022','Hmotné movité věci','Aktiva','02 DHM','0'),
        ('025','Pěstitelské celky','Aktiva','02 DHM','0'),
        ('026','Dospělá zvířata','Aktiva','02 DHM','0'),
        ('029','Jiný DHM','Aktiva','02 DHM','0'),
        ('031','Pozemky','Aktiva','03 DHM neodpisovaný','0'),
        ('032','Umělecká díla a sbírky','Aktiva','03 DHM neodpisovaný','0'),
        ('041','Nedokončený DNM','Aktiva','04 Nedokončený DM','0'),
        ('042','Nedokončený DHM','Aktiva','04 Nedokončený DM','0'),
        ('043','Pořizovaný DFM','Aktiva','04 Nedokončený DM','0'),
        ('051','Zálohy na DNM','Aktiva','05 Zálohy na DM','0'),
        ('052','Zálohy na DHM','Aktiva','05 Zálohy na DM','0'),
        ('053','Zálohy na DFM','Aktiva','05 Zálohy na DM','0'),
        ('061','Podíly – ovládaná osoba','Aktiva','06 DFM','0'),
        ('062','Podíly – podstatný vliv','Aktiva','06 DFM','0'),
        ('063','Ostatní DL cenné papíry','Aktiva','06 DFM','0'),
        ('065','Dluhové CP držené do splatnosti','Aktiva','06 DFM','0'),
        ('066','Zápůjčky a úvěry – ovládaná osoba','Aktiva','06 DFM','0'),
        ('067','Ostatní zápůjčky a úvěry','Aktiva','06 DFM','0'),
        ('069','Jiný DFM','Aktiva','06 DFM','0'),
        ('071','Oprávky k nehmotným výsl. vývoje','Aktiva','07 Oprávky k DNM','0'),
        ('072','Oprávky k nehmotným výsl. vývoje','Aktiva','07 Oprávky k DNM','0'),
        ('073','Oprávky k softwaru','Aktiva','07 Oprávky k DNM','0'),
        ('074','Oprávky k ocenitelným právům','Aktiva','07 Oprávky k DNM','0'),
        ('075','Oprávky ke goodwillu','Aktiva','07 Oprávky k DNM','0'),
        ('079','Oprávky k ostatnímu DNM','Aktiva','07 Oprávky k DNM','0'),
        ('081','Oprávky ke stavbám','Aktiva','08 Oprávky k DHM','0'),
        ('082','Oprávky k hmotným movitým věcem','Aktiva','08 Oprávky k DHM','0'),
        ('085','Oprávky k pěstitelským celkům','Aktiva','08 Oprávky k DHM','0'),
        ('086','Oprávky k dospělým zvířatům','Aktiva','08 Oprávky k DHM','0'),
        ('089','Oprávky k jinému DHM','Aktiva','08 Oprávky k DHM','0'),
        ('091','Opravná položka k DNM','Aktiva','09 Opravné položky k DM','0'),
        ('092','Opravná položka k DHM','Aktiva','09 Opravné položky k DM','0'),
        ('093','Opravná položka k nedokonč. DNM','Aktiva','09 Opravné položky k DM','0'),
        ('094','Opravná položka k nedokonč. DHM','Aktiva','09 Opravné položky k DM','0'),
        ('095','Opravná položka k zálobám na DM','Aktiva','09 Opravné položky k DM','0'),
        ('096','Opravná položka k DFM','Aktiva','09 Opravné položky k DM','0'),
        ('098','Oprávky k oceňovacímu rozdílu','Aktiva','09 Opravné položky k DM','0'),
        # Třída 1 – Zásoby
        ('111','Pořízení materiálu','Aktiva','11 Materiál','1'),
        ('112','Materiál na skladě','Aktiva','11 Materiál','1'),
        ('119','Materiál na cestě','Aktiva','11 Materiál','1'),
        ('121','Nedokončená výroba','Aktiva','12 Zásoby vl. činnosti','1'),
        ('122','Polotovary vlastní výroby','Aktiva','12 Zásoby vl. činnosti','1'),
        ('123','Výrobky','Aktiva','12 Zásoby vl. činnosti','1'),
        ('124','Mladá a ostatní zvířata','Aktiva','12 Zásoby vl. činnosti','1'),
        ('131','Pořízení zboží','Aktiva','13 Zboží','1'),
        ('132','Zboží na skladě a v prodejnách','Aktiva','13 Zboží','1'),
        ('139','Zboží na cestě','Aktiva','13 Zboží','1'),
        ('151','Poskytnuté zálohy na materiál','Aktiva','15 Zálohy na zásoby','1'),
        ('152','Poskytnuté zálohy na zvířata','Aktiva','15 Zálohy na zásoby','1'),
        ('153','Poskytnuté zálohy na zboží','Aktiva','15 Zálohy na zásoby','1'),
        ('191','Opravná položka k materiálu','Aktiva','19 OP k zásobám','1'),
        ('192','Opravná položka k nedok. výrobě','Aktiva','19 OP k zásobám','1'),
        ('193','Opravná položka k výrobkům','Aktiva','19 OP k zásobám','1'),
        ('196','Opravná položka ke zboží','Aktiva','19 OP k zásobám','1'),
        ('197','Opravná položka k zálobám na mat.','Aktiva','19 OP k zásobám','1'),
        # Třída 2 – Krátkodobý finanční majetek
        ('211','Peněžní prostředky v pokladně','Aktiva','21 Peníze','2'),
        ('213','Ceniny','Aktiva','21 Peníze','2'),
        ('221','Peněžní prostředky na účtech','Aktiva','22 Účty v bankách','2'),
        ('231','Krátkodobé úvěry','Pasiva','23 Krátkodobé úvěry','2'),
        ('232','Eskontní úvěry','Pasiva','23 Krátkodobé úvěry','2'),
        ('241','Vydané krátkodobé dluhopisy','Pasiva','24 Krátkodobé fin. výpomoci','2'),
        ('249','Ostatní krátkodobé fin. výpomoci','Pasiva','24 Krátkodobé fin. výpomoci','2'),
        ('251','Registrované majetkové CP','Aktiva','25 Krátkodobé CP','2'),
        ('252','Vlastní podíly','Aktiva','25 Krátkodobé CP','2'),
        ('253','Registrované dluhové CP','Aktiva','25 Krátkodobé CP','2'),
        ('255','Vlastní dluhopisy','Aktiva','25 Krátkodobé CP','2'),
        ('256','Dluhové CP se splat. do 1 roku','Aktiva','25 Krátkodobé CP','2'),
        ('257','Ostatní cenné papíry','Aktiva','25 Krátkodobé CP','2'),
        ('258','Podíly – ovládaná osoba','Aktiva','25 Krátkodobé CP','2'),
        ('259','Pořizování krátkodobého FM','Aktiva','25 Krátkodobé CP','2'),
        ('261','Peníze na cestě','Aktiva','26 Převody','2'),
        ('291','Opravná položka ke kr. FM','Aktiva','29 OP ke kr. FM','2'),
        # Třída 3 – Zúčtovací vztahy
        ('311','Pohledávky z obchodních vztahů','Aktiva','31 Pohledávky','3'),
        ('312','Směnky k inkasu','Aktiva','31 Pohledávky','3'),
        ('313','Pohledávky za eskontované CP','Aktiva','31 Pohledávky','3'),
        ('314','Poskytnuté zálohy – krátkodobé','Aktiva','31 Pohledávky','3'),
        ('315','Ostatní pohledávky','Aktiva','31 Pohledávky','3'),
        ('321','Závazky z obchodních vztahů','Pasiva','32 Závazky','3'),
        ('322','Směnky k úhradě','Pasiva','32 Závazky','3'),
        ('324','Přijaté zálohy','Pasiva','32 Závazky','3'),
        ('325','Ostatní závazky','Pasiva','32 Závazky','3'),
        ('331','Zaměstnanci','Pasiva','33 Zúčt. se zaměstnanci','3'),
        ('333','Ostatní závazky vůči zaměstnancům','Pasiva','33 Zúčt. se zaměstnanci','3'),
        ('335','Pohledávky za zaměstnanci','Aktiva','33 Zúčt. se zaměstnanci','3'),
        ('336','Zúčtování s institucemi soc. a zdr.','Pasiva','33 Zúčt. se zaměstnanci','3'),
        ('341','Daň z příjmů','Pasiva','34 Daně a dotace','3'),
        ('342','Ostatní přímé daně','Pasiva','34 Daně a dotace','3'),
        ('343','Daň z přidané hodnoty','Pasiva','34 Daně a dotace','3'),
        ('345','Ostatní daně a poplatky','Pasiva','34 Daně a dotace','3'),
        ('346','Dotace ze státního rozpočtu','Aktiva','34 Daně a dotace','3'),
        ('347','Ostatní dotace','Aktiva','34 Daně a dotace','3'),
        ('349','Vyrovnávací účet pro DPH','Pasiva','34 Daně a dotace','3'),
        ('351','Pohledávky – ovládaná osoba','Aktiva','35 Pohl. za společníky','3'),
        ('352','Pohledávky – podstatný vliv','Aktiva','35 Pohl. za společníky','3'),
        ('353','Pohledávky za upsaný ZK','Aktiva','35 Pohl. za společníky','3'),
        ('354','Pohledávky za společníky při úhradě','Aktiva','35 Pohl. za společníky','3'),
        ('355','Ostatní pohl. za společníky','Aktiva','35 Pohl. za společníky','3'),
        ('358','Pohledávky za společníky sdruž.','Aktiva','35 Pohl. za společníky','3'),
        ('361','Závazky – ovládaná osoba','Pasiva','36 Záv. ke společníkům','3'),
        ('362','Závazky – podstatný vliv','Pasiva','36 Záv. ke společníkům','3'),
        ('364','Závazky ke společníkům při rozdělování','Pasiva','36 Záv. ke společníkům','3'),
        ('365','Ostatní závazky ke společníkům','Pasiva','36 Záv. ke společníkům','3'),
        ('366','Závazky ke společníkům ze závislé činn.','Pasiva','36 Záv. ke společníkům','3'),
        ('367','Závazky z upsaných nespl. CP','Pasiva','36 Záv. ke společníkům','3'),
        ('368','Závazky ke společníkům sdružení','Pasiva','36 Záv. ke společníkům','3'),
        ('371','Pohledávky z prodeje obch. závodu','Aktiva','37 Jiné pohledávky','3'),
        ('372','Závazky z koupě obch. závodu','Pasiva','37 Jiné pohledávky','3'),
        ('373','Pohledávky z pevných term. operací','Aktiva','37 Jiné pohledávky','3'),
        ('374','Pohledávky z nájmu','Aktiva','37 Jiné pohledávky','3'),
        ('375','Pohledávky z vydaných dluhopisů','Aktiva','37 Jiné pohledávky','3'),
        ('376','Nakoupené opce','Aktiva','37 Jiné pohledávky','3'),
        ('377','Prodané opce','Pasiva','37 Jiné pohledávky','3'),
        ('378','Jiné pohledávky','Aktiva','37 Jiné pohledávky','3'),
        ('379','Jiné závazky','Pasiva','37 Jiné pohledávky','3'),
        ('381','Náklady příštích období','Aktiva','38 Přechodné účty','3'),
        ('382','Komplexní náklady příštích období','Aktiva','38 Přechodné účty','3'),
        ('383','Výdaje příštích období','Pasiva','38 Přechodné účty','3'),
        ('384','Výnosy příštích období','Pasiva','38 Přechodné účty','3'),
        ('385','Příjmy příštích období','Aktiva','38 Přechodné účty','3'),
        ('386','Dohadné účty aktivní','Aktiva','38 Přechodné účty','3'),
        ('388','Dohadné účty pasivní','Pasiva','38 Přechodné účty','3'),
        ('391','Opravná položka k pohledávkám','Aktiva','39 OP k zúčt. vztahům','3'),
        ('395','Vnitřní zúčtování','Aktiva','39 OP k zúčt. vztahům','3'),
        ('398','Spojovací účet při společnosti','Aktiva','39 OP k zúčt. vztahům','3'),
        # Třída 4 – Kapitálové účty a dlouhodobé závazky
        ('411','Základní kapitál','Pasiva','41 Základní kapitál','4'),
        ('412','Ážio','Pasiva','41 Základní kapitál','4'),
        ('413','Ostatní kapitálové fondy','Pasiva','41 Základní kapitál','4'),
        ('414','Oceňovací rozdíly z přecenění','Pasiva','41 Základní kapitál','4'),
        ('416','Oceňovací rozdíly z přeměn','Pasiva','41 Základní kapitál','4'),
        ('417','Rozdíly z přeměn obch. korporací','Pasiva','41 Základní kapitál','4'),
        ('418','Oceňovací rozdíly při přeměnách','Pasiva','41 Základní kapitál','4'),
        ('419','Změny základního kapitálu','Pasiva','41 Základní kapitál','4'),
        ('421','Ostatní rezervní fondy','Pasiva','42 Fondy','4'),
        ('422','Nedělitelný fond','Pasiva','42 Fondy','4'),
        ('423','Statutární fondy','Pasiva','42 Fondy','4'),
        ('427','Ostatní fondy','Pasiva','42 Fondy','4'),
        ('428','Nerozdělený zisk minulých let','Pasiva','42 Fondy','4'),
        ('429','Neuhrazená ztráta minulých let','Pasiva','42 Fondy','4'),
        ('431','HV ve schvalovacím řízení','Pasiva','43 HV','4'),
        ('432','Rozhodnutí o zálohové výplatě podílu','Pasiva','43 HV','4'),
        ('451','Rezervy podle zvláštních předpisů','Pasiva','45 Rezervy','4'),
        ('453','Rezerva na daň z příjmů','Pasiva','45 Rezervy','4'),
        ('459','Ostatní rezervy','Pasiva','45 Rezervy','4'),
        ('461','Závazky k úvěrovým institucím','Pasiva','46 DL závazky','4'),
        ('471','Dlouhodobé závazky – ovládaná osoba','Pasiva','47 DL závazky','4'),
        ('472','Dlouhodobé závazky – podstatný vliv','Pasiva','47 DL závazky','4'),
        ('473','Vydané dluhopisy','Pasiva','47 DL závazky','4'),
        ('474','Závazky z nájmu','Pasiva','47 DL závazky','4'),
        ('475','Dlouhodobé přijaté zálohy','Pasiva','47 DL závazky','4'),
        ('478','Dlouhodobé směnky k úhradě','Pasiva','47 DL závazky','4'),
        ('479','Jiné dlouhodobé závazky','Pasiva','47 DL závazky','4'),
        ('481','Odložený daňový závazek a pohledávka','Pasiva','48 Odložený daňový záv.','4'),
        ('491','Účet individuálního podnikatele','Pasiva','49 Individuální podnikatel','4'),
        # Třída 5 – Náklady
        ('501','Spotřeba materiálu','Náklady','50 Spotřebované nákupy','5'),
        ('502','Spotřeba energie','Náklady','50 Spotřebované nákupy','5'),
        ('503','Spotřeba ostatních neskladovatelných dodávek','Náklady','50 Spotřebované nákupy','5'),
        ('504','Prodané zboží','Náklady','50 Spotřebované nákupy','5'),
        ('511','Opravy a udržování','Náklady','51 Služby','5'),
        ('512','Cestovné','Náklady','51 Služby','5'),
        ('513','Náklady na reprezentaci','Náklady','51 Služby','5'),
        ('518','Ostatní služby','Náklady','51 Služby','5'),
        ('521','Mzdové náklady','Náklady','52 Osobní náklady','5'),
        ('522','Příjmy společníků obch. korporace','Náklady','52 Osobní náklady','5'),
        ('523','Odměny členům orgánů','Náklady','52 Osobní náklady','5'),
        ('524','Zákonné sociální a zdravotní pojištění','Náklady','52 Osobní náklady','5'),
        ('525','Ostatní sociální pojištění','Náklady','52 Osobní náklady','5'),
        ('526','Sociální náklady individuálního podnikatele','Náklady','52 Osobní náklady','5'),
        ('527','Zákonné sociální náklady','Náklady','52 Osobní náklady','5'),
        ('528','Ostatní sociální náklady','Náklady','52 Osobní náklady','5'),
        ('531','Daň silniční','Náklady','53 Daně a poplatky','5'),
        ('532','Daň z nemovitých věcí','Náklady','53 Daně a poplatky','5'),
        ('538','Ostatní daně a poplatky','Náklady','53 Daně a poplatky','5'),
        ('541','Zůstatková cena prodaného DM','Náklady','54 Jiné provozní náklady','5'),
        ('542','Prodaný materiál','Náklady','54 Jiné provozní náklady','5'),
        ('543','Dary','Náklady','54 Jiné provozní náklady','5'),
        ('544','Smluvní pokuty a úroky z prodlení','Náklady','54 Jiné provozní náklady','5'),
        ('545','Ostatní pokuty a penále','Náklady','54 Jiné provozní náklady','5'),
        ('546','Odpis pohledávky','Náklady','54 Jiné provozní náklady','5'),
        ('548','Ostatní provozní náklady','Náklady','54 Jiné provozní náklady','5'),
        ('549','Manka a škody v provozní oblasti','Náklady','54 Jiné provozní náklady','5'),
        ('551','Odpisy DNM a DHM','Náklady','55 Odpisy a OP','5'),
        ('552','Tvorba a zúčtování rezerv – zvl. předp.','Náklady','55 Odpisy a OP','5'),
        ('553','Tvorba a zúčtování ostatních rezerv','Náklady','55 Odpisy a OP','5'),
        ('554','Tvorba a zúčtování komplexních NPO','Náklady','55 Odpisy a OP','5'),
        ('557','Zúčtování oprávky k oceň. rozdílu','Náklady','55 Odpisy a OP','5'),
        ('558','Tvorba a zúčtování zákonných OP','Náklady','55 Odpisy a OP','5'),
        ('559','Tvorba a zúčtování ostatních OP','Náklady','55 Odpisy a OP','5'),
        ('561','Prodané cenné papíry a podíly','Náklady','56 Finanční náklady','5'),
        ('562','Úroky','Náklady','56 Finanční náklady','5'),
        ('563','Kurzové ztráty','Náklady','56 Finanční náklady','5'),
        ('564','Náklady z přecenění maj. CP','Náklady','56 Finanční náklady','5'),
        ('565','Poskytnuté dary ve fin. oblasti','Náklady','56 Finanční náklady','5'),
        ('566','Náklady z finančního majetku','Náklady','56 Finanční náklady','5'),
        ('567','Náklady z derivátových operací','Náklady','56 Finanční náklady','5'),
        ('568','Ostatní finanční náklady','Náklady','56 Finanční náklady','5'),
        ('569','Manka a škody ve finanční oblasti','Náklady','56 Finanční náklady','5'),
        ('574','Tvorba a zúčtování finančních rezerv','Náklady','57 Rezervy a OP ve fin.','5'),
        ('579','Tvorba a zúčtování OP ve fin. činnosti','Náklady','57 Rezervy a OP ve fin.','5'),
        ('581','Změna stavu nedokončené výroby','Náklady','58 Změna stavu zásob','5'),
        ('582','Změna stavu polotovarů','Náklady','58 Změna stavu zásob','5'),
        ('583','Změna stavu výrobků','Náklady','58 Změna stavu zásob','5'),
        ('584','Změna stavu zvířat','Náklady','58 Změna stavu zásob','5'),
        ('585','Aktivace materiálu a zboží','Náklady','58 Změna stavu zásob','5'),
        ('586','Aktivace vnitropodnikových služeb','Náklady','58 Změna stavu zásob','5'),
        ('587','Aktivace DNM a DHM','Náklady','58 Změna stavu zásob','5'),
        ('591','Daň z příjmů – splatná','Náklady','59 Daně z příjmů','5'),
        ('592','Daň z příjmů – odložená','Náklady','59 Daně z příjmů','5'),
        ('593','Daň z příjmů z mim. činnosti – splatná','Náklady','59 Daně z příjmů','5'),
        ('595','Dodatečné odvody daně z příjmů','Náklady','59 Daně z příjmů','5'),
        ('596','Převod podílu na HV společníkům','Náklady','59 Daně z příjmů','5'),
        ('597','Převod provozních nákladů','Náklady','59 Daně z příjmů','5'),
        ('598','Převod finančních nákladů','Náklady','59 Daně z příjmů','5'),
        # Třída 6 – Výnosy
        ('601','Tržby za vlastní výrobky','Výnosy','60 Tržby za vl. výkony a zboží','6'),
        ('602','Tržby za služby','Výnosy','60 Tržby za vl. výkony a zboží','6'),
        ('604','Tržby za zboží','Výnosy','60 Tržby za vl. výkony a zboží','6'),
        ('641','Tržby z prodeje DM','Výnosy','64 Jiné provozní výnosy','6'),
        ('642','Tržby z prodeje materiálu','Výnosy','64 Jiné provozní výnosy','6'),
        ('643','Smluvní pokuty a úroky z prodlení','Výnosy','64 Jiné provozní výnosy','6'),
        ('644','Přijaté dary v provozní oblasti','Výnosy','64 Jiné provozní výnosy','6'),
        ('645','Výnosy z postoupených pohledávek','Výnosy','64 Jiné provozní výnosy','6'),
        ('646','Výnosy z odepsaných pohledávek','Výnosy','64 Jiné provozní výnosy','6'),
        ('647','Mimořádné provozní výnosy','Výnosy','64 Jiné provozní výnosy','6'),
        ('648','Ostatní provozní výnosy','Výnosy','64 Jiné provozní výnosy','6'),
        ('649','Odpis záporného goodwillu','Výnosy','64 Jiné provozní výnosy','6'),
        ('661','Tržby z prodeje CP a podílů','Výnosy','66 Finanční výnosy','6'),
        ('662','Úroky','Výnosy','66 Finanční výnosy','6'),
        ('663','Kurzové zisky','Výnosy','66 Finanční výnosy','6'),
        ('664','Výnosy z přecenění maj. CP','Výnosy','66 Finanční výnosy','6'),
        ('665','Výnosy z dlouhodobého FM','Výnosy','66 Finanční výnosy','6'),
        ('666','Výnosy z krátkodobého FM','Výnosy','66 Finanční výnosy','6'),
        ('667','Výnosy z derivátových operací','Výnosy','66 Finanční výnosy','6'),
        ('668','Ostatní finanční výnosy','Výnosy','66 Finanční výnosy','6'),
        ('669','Přijaté dary ve finanční oblasti','Výnosy','66 Finanční výnosy','6'),
        ('691','Převodové účty','Výnosy','69 Převodové účty','6'),
        ('697','Převod provozních výnosů','Výnosy','69 Převodové účty','6'),
        ('698','Převod finančních výnosů','Výnosy','69 Převodové účty','6'),
        # Třída 7 – Závěrkové a podrozvahové
        ('701','Počáteční účet rozvážný','Závěrkové','70 Účty rozvážné','7'),
        ('702','Konečný účet rozvážný','Závěrkové','70 Účty rozvážné','7'),
        ('710','Účet zisků a ztrát','Závěrkové','71 Účet zisků a ztrát','7'),
        ('799','Evidenční účet','Podrozvahové','79 Podrozvahové účty','7'),
    ]
    rows = []
    for ucet_cislo, ucet_nazev, typ, skupina, trida in accounts:
        rows.append((ucet_cislo, ucet_nazev, typ, skupina, trida,
                      random.choice(['aktivní']*9 + ['neaktivní'])))
    return save(pd.DataFrame(rows, columns=['ucet_cislo','ucet_nazev','typ','skupina','trida','stav']),
                'dim_ucty.csv')

def gen_zamestnanci(strediska):
    pozice = ['Analytik','Účetní','Manažer','Technik','Operátor','Obchodník','Programátor',
              'Ředitel','Asistent','Koordinátor','Správce','Specialista','Konzultant','Inženýr','Dispečer']
    rows = []
    for i in range(500):
        nastup = DATE_START + datetime.timedelta(random.randint(-1500, 800))
        rows.append((f'EMP{i+1:04d}', fake.first_name(), fake.last_name(),
                      random.choice(strediska['stredisko_id'].tolist()),
                      random.choice(pozice),
                      round(random.uniform(28000, 120000), 0),
                      nastup.isoformat(),
                      random.choice(['Aktivní']*9 + ['Neaktivní']),
                      random.choice(['Plný úvazek']*8 + ['Částečný úvazek','DPP']),
                      fake.email()))
    return save(pd.DataFrame(rows, columns=['zamestnanec_id','jmeno','prijmeni','stredisko_id',
                'pozice','hruba_mzda','datum_nastupu','stav','typ_uvazku','email']),
                'dim_zamestnanci.csv')

def gen_produkty():
    kategorie = ['Elektronika','Strojírenství','Software','Služby','Chemie',
                  'Potraviny','Textil','Stavebnictví','Automotive','Energie']
    rows = []
    for i in range(300):
        cena = round(random.uniform(50, 50000), 2)
        marze = random.uniform(0.1, 0.6)
        rows.append((f'PRD{i+1:04d}', fake.catch_phrase()[:40],
                      random.choice(kategorie), cena,
                      round(cena * (1 - marze), 2),
                      random.choice(['ks','kg','l','m','hod','bal']),
                      random.choice(['Aktivní']*8 + ['Ukončený','Plánovaný'])))
    return save(pd.DataFrame(rows, columns=['produkt_id','produkt_nazev','kategorie',
                'prodejni_cena','nakladova_cena','jednotka','stav']),
                'dim_produkty.csv')

def gen_zakaznici(regiony):
    segmenty = ['Enterprise','SMB','Retail','Government','Non-profit']
    rows = []
    for i in range(200):
        rows.append((f'CUS{i+1:04d}', fake.company()[:50],
                      random.choice(segmenty),
                      random.choice(regiony['region_id'].tolist()),
                      fake.street_address(), fake.city(),
                      random.choice(['Aktivní']*8 + ['Neaktivní','Prospect']),
                      round(random.uniform(10000, 5000000), 2),
                      random.choice(['NET30','NET60','NET90','COD'])))
    return save(pd.DataFrame(rows, columns=['zakaznik_id','zakaznik_nazev','segment','region_id',
                'adresa','mesto','stav','kreditni_limit','platebni_podminky']),
                'dim_zakaznici.csv')

def gen_dodavatele():
    kategorie = ['Materiál','Služby','IT','Logistika','Energie','Suroviny','Údržba','Marketing']
    rows = []
    for i in range(100):
        rows.append((f'SUP{i+1:03d}', fake.company()[:50],
                      random.choice(kategorie),
                      random.choice(['A','A','B','B','C']),
                      fake.street_address(), fake.city(),
                      random.choice(['CZ','CZ','CZ','SK','DE','AT']),
                      random.choice(['Aktivní']*8 + ['Neaktivní','Blokovaný']),
                      random.choice(['NET30','NET45','NET60','Předem'])))
    return save(pd.DataFrame(rows, columns=['dodavatel_id','dodavatel_nazev','kategorie',
                'hodnoceni','adresa','mesto','zeme','stav','platebni_podminky']),
                'dim_dodavatele.csv')

# ============================================================
# 2. FACT TABLES
# ============================================================

def gen_transakce(ucty, strediska, projekty, profit_centra, pobocky, n=500000):
    """Main accounting transactions."""
    print(f"\n  Generating {n:,} transactions...")
    typy_dokladu = ['FAP','FAP','FAV','FAV','FAV','PPD','VPD','BV','BV','INT','OPR','ZAL','DOB','STR']
    meny = ['CZK']*80 + ['EUR']*15 + ['USD']*5
    dph_sazby = [0.21, 0.21, 0.21, 0.15, 0.15, 0.10, 0.0]
    kurzy = {'CZK': 1.0, 'EUR': 24.5, 'USD': 22.8}

    ucet_list = ucty['ucet_cislo'].tolist()
    str_list = strediska['stredisko_id'].tolist()
    proj_list = projekty['projekt_id'].tolist()
    pc_list = profit_centra['profit_centrum_id'].tolist()
    pob_list = pobocky['pobocka_id'].tolist()

    chunk_size = 50000
    chunks = []
    tx_id = 1

    for chunk_start in range(0, n, chunk_size):
        cn = min(chunk_size, n - chunk_start)
        dates = seasonal_dates(cn)
        castky_base = np.abs(np.random.lognormal(mean=8, sigma=2, size=cn)).round(2)
        castky_base = np.clip(castky_base, 10, 50000000)

        rows = []
        for i in range(cn):
            mena = random.choice(meny)
            dph_sazba = random.choice(dph_sazby)
            castka = float(castky_base[i])
            dph = round(castka * dph_sazba, 2)
            typ_dokladu = random.choice(typy_dokladu)
            ucet_md = random.choice(ucet_list)
            ucet_dal = random.choice(ucet_list)
            while ucet_dal == ucet_md:
                ucet_dal = random.choice(ucet_list)

            rows.append((
                f'TX{tx_id:07d}', dates[i].isoformat(), typ_dokladu,
                castka, mena, kurzy[mena], round(castka * kurzy[mena], 2),
                dph_sazba, dph,
                ucet_md, ucet_dal,
                random.choice(str_list), random.choice(proj_list),
                random.choice(pc_list), random.choice(pob_list),
                fake.sentence(nb_words=4)[:60] if random.random() < 0.3 else '',
                random.choice(['Zaúčtováno','Zaúčtováno','Zaúčtováno','Koncept','Storno']),
                f'USR{random.randint(1,50):03d}',
            ))
            tx_id += 1

        chunks.append(pd.DataFrame(rows, columns=[
            'transakce_id','datum','typ_dokladu','castka','mena','kurz','castka_czk',
            'dph_sazba','dph_castka','ucet_md','ucet_dal','stredisko_id','projekt_id',
            'profit_centrum_id','pobocka_id','popis','stav','uzivatel']))

        print(f"    chunk {chunk_start+cn:>10,}/{n:,}")

    df = pd.concat(chunks, ignore_index=True)
    return save(df, 'fact_transakce.csv')

def gen_mzdy(zamestnanci):
    """Payroll data – monthly for each active employee."""
    rows = []
    emps = zamestnanci[zamestnanci['stav'] == 'Aktivní']
    for _, emp in emps.iterrows():
        hruba = float(emp['hruba_mzda'])
        for year in range(2023, 2026):
            for month in range(1, 13):
                soc_zam = round(hruba * 0.065, 2)  # employee social
                zdr_zam = round(hruba * 0.045, 2)  # employee health
                soc_firm = round(hruba * 0.248, 2)  # employer social
                zdr_firm = round(hruba * 0.09, 2)   # employer health
                dan = round(max(0, (hruba - soc_zam - zdr_zam) * 0.15), 2)
                cista = round(hruba - soc_zam - zdr_zam - dan, 2)
                odmena = round(random.uniform(0, hruba * 0.15), 2) if random.random() < 0.2 else 0
                rows.append((
                    emp['zamestnanec_id'], emp['stredisko_id'], f'{year}-{month:02d}',
                    hruba, odmena, hruba + odmena,
                    soc_zam, zdr_zam, soc_firm, zdr_firm, dan,
                    cista + odmena * 0.7,
                    round(hruba + odmena + soc_firm + zdr_firm, 2)
                ))
    return save(pd.DataFrame(rows, columns=[
        'zamestnanec_id','stredisko_id','obdobi','zakladni_mzda','odmeny','hruba_mzda_celkem',
        'soc_pojisteni_zam','zdr_pojisteni_zam','soc_pojisteni_firma','zdr_pojisteni_firma',
        'dan_z_prijmu','cista_mzda','celkove_naklady_firma']),
        'fact_mzdy.csv')

def gen_prodeje(zakaznici, produkty, pobocky, n=100000):
    """Sales / revenue data."""
    zak_list = zakaznici['zakaznik_id'].tolist()
    prod_df = produkty[['produkt_id','prodejni_cena','nakladova_cena']].values.tolist()
    pob_list = pobocky['pobocka_id'].tolist()
    kanaly = ['E-shop','Pobočka','Telefon','B2B portál','Obchodní zástupce']

    rows = []
    dates = seasonal_dates(n)
    for i in range(n):
        prod = random.choice(prod_df)
        mnozstvi = random.randint(1, 100)
        cena = float(prod[1])
        sleva_pct = random.choice([0,0,0,0,5,10,15,20]) / 100
        dph = random.choice([0.21, 0.15, 0.10])
        celkem_bez_dph = round(mnozstvi * cena * (1 - sleva_pct), 2)
        rows.append((
            f'FAV{i+1:07d}', dates[i].isoformat(),
            random.choice(zak_list), prod[0], mnozstvi, cena,
            sleva_pct, celkem_bez_dph,
            dph, round(celkem_bez_dph * dph, 2), round(celkem_bez_dph * (1 + dph), 2),
            round(mnozstvi * float(prod[2]), 2),
            random.choice(pob_list), random.choice(kanaly),
            random.choice(['Zaplaceno','Zaplaceno','Zaplaceno','Nezaplaceno','Částečně','Storno']),
            random.choice(['CZK']*85 + ['EUR']*15),
        ))
        if (i+1) % 25000 == 0:
            print(f"    sales {i+1:>10,}/{n:,}")

    return save(pd.DataFrame(rows, columns=[
        'faktura_id','datum','zakaznik_id','produkt_id','mnozstvi','jednotkova_cena',
        'sleva_pct','celkem_bez_dph','dph_sazba','dph_castka','celkem_s_dph',
        'nakladova_cena_celkem','pobocka_id','kanal','stav_platby','mena']),
        'fact_prodeje.csv')

def gen_nakupy(dodavatele, produkty, strediska, n=50000):
    """Purchase / procurement data."""
    dod_list = dodavatele['dodavatel_id'].tolist()
    str_list = strediska['stredisko_id'].tolist()
    typy_pol = ['Materiál','Služba','Energie','Náhradní díly','Kancelářské potřeby',
                'IT vybavení','Software licence','Doprava','Údržba','Suroviny']

    rows = []
    dates = random_dates(n)
    for i in range(n):
        mnozstvi = random.randint(1, 500)
        cena = round(random.uniform(20, 25000), 2)
        dph = random.choice([0.21, 0.15, 0.10, 0.0])
        celkem = round(mnozstvi * cena, 2)
        rows.append((
            f'OBJ{i+1:06d}', dates[i].isoformat(),
            random.choice(dod_list), random.choice(typy_pol),
            mnozstvi, cena, celkem, dph, round(celkem * dph, 2), round(celkem * (1 + dph), 2),
            random.choice(str_list),
            random.choice(['Schváleno','Schváleno','Přijato','Částečně přijato','Reklamace','Koncept']),
            random.choice(['CZK']*85 + ['EUR']*10 + ['USD']*5),
        ))
        if (i+1) % 10000 == 0:
            print(f"    purchases {i+1:>10,}/{n:,}")

    return save(pd.DataFrame(rows, columns=[
        'objednavka_id','datum','dodavatel_id','typ_polozky','mnozstvi','jednotkova_cena',
        'celkem_bez_dph','dph_sazba','dph_castka','celkem_s_dph','stredisko_id','stav','mena']),
        'fact_nakupy.csv')

def gen_vyrobni_zakazky(produkty, strediska, n=20000):
    """Production / manufacturing orders."""
    vyr_produkty = produkty[produkty['kategorie'].isin(
        ['Elektronika','Strojírenství','Chemie','Automotive','Textil','Stavebnictví'])
    ]['produkt_id'].tolist()
    if not vyr_produkty:
        vyr_produkty = produkty['produkt_id'].tolist()[:50]
    str_vyr = strediska[strediska['typ'] == 'Výroba']['stredisko_id'].tolist()
    if not str_vyr:
        str_vyr = strediska['stredisko_id'].tolist()[:10]
    stavy = ['Plánováno','V výrobě','V výrobě','Dokončeno','Dokončeno','Dokončeno','Pozastaveno','Zrušeno']

    rows = []
    for i in range(n):
        start = DATE_START + datetime.timedelta(random.randint(0, 900))
        dur = random.randint(1, 45)
        mnozstvi = random.randint(10, 5000)
        mat_cost = round(random.uniform(1000, 500000), 2)
        labor_cost = round(mat_cost * random.uniform(0.2, 0.8), 2)
        overhead = round((mat_cost + labor_cost) * random.uniform(0.05, 0.25), 2)
        rows.append((
            f'VZ{i+1:06d}', random.choice(vyr_produkty), mnozstvi,
            start.isoformat(), (start + datetime.timedelta(dur)).isoformat(),
            random.choice(str_vyr), mat_cost, labor_cost, overhead,
            round(mat_cost + labor_cost + overhead, 2),
            random.choice(stavy), round(random.uniform(0.85, 1.05), 3),
            random.randint(0, int(mnozstvi * 0.05)),
        ))

    return save(pd.DataFrame(rows, columns=[
        'zakazka_id','produkt_id','planovane_mnozstvi','datum_zahajeni','datum_ukonceni',
        'stredisko_id','naklady_material','naklady_prace','naklady_rezie',
        'celkove_naklady','stav','vyuziti_kapacity','zmetky']),
        'fact_vyrobni_zakazky.csv')

def gen_cashflow(pobocky, ucty, n=250000):
    """Cash flow data – guaranteed net positive cash flow."""
    # Income types with HIGHER amounts, expense types with LOWER amounts
    income_typy = ['Příjem z prodeje','Příjem z prodeje','Příjem z prodeje',
                   'Příjem z prodeje','Příjem úvěru','Ostatní příjem',
                   'Příjem z pohledávek','Přijatá dotace','Příjem z investice']
    expense_typy = ['Platba dodavateli','Platba dodavateli','Mzdy','Daně',
                    'Splátka úvěru','Úroky','Investice','Ostatní výdaj','Nájemné','Energie']
    pob_list = pobocky['pobocka_id'].tolist()
    fin_ucty = ucty[ucty['skupina'].str.contains('Peníze|Účty v bankách|Krátkodobé úvěry', na=False)]['ucet_cislo'].tolist()
    if not fin_ucty:
        fin_ucty = ['211','213','221','231']

    rows = []
    dates = seasonal_dates(n)
    for i in range(n):
        # 65% income, 35% expense → guaranteed positive cash flow
        is_income = random.random() < 0.65
        if is_income:
            typ = random.choice(income_typy)
            castka = round(random.uniform(5000, 3500000), 2)  # higher income
        else:
            typ = random.choice(expense_typy)
            castka = round(random.uniform(500, 1800000), 2)  # lower expense

        rows.append((
            f'CF{i+1:07d}', dates[i].isoformat(), typ,
            'Příjem' if is_income else 'Výdaj',
            castka if is_income else -castka,
            random.choice(fin_ucty), random.choice(pob_list),
            random.choice(['CZK']*85 + ['EUR']*15),
            random.choice(['Realizováno']*7 + ['Plánováno']*2 + ['Avizováno']),
            random.choice(['Provozní','Provozní','Provozní','Investiční','Finanční']),
        ))
        if (i+1) % 50000 == 0:
            print(f"    cashflow {i+1:>10,}/{n:,}")

    return save(pd.DataFrame(rows, columns=[
        'cashflow_id','datum','typ_pohybu','smer','castka','ucet','pobocka_id','mena','stav','oblast']),
        'fact_cashflow.csv')

def gen_budget(strediska, ucty):
    """Budget vs actual per cost center, account, and month."""
    str_list = strediska['stredisko_id'].tolist()
    # Use subset of accounts for budgeting (costs & revenues)
    budget_ucty = ucty[ucty['typ'].isin(['Náklady','Výnosy'])]['ucet_cislo'].tolist()
    if len(budget_ucty) > 40:
        budget_ucty = random.sample(budget_ucty, 40)

    rows = []
    for strid in str_list:
        for ucet in random.sample(budget_ucty, min(8, len(budget_ucty))):
            for year in range(2023, 2026):
                for month in range(1, 13):
                    plan = round(random.uniform(5000, 500000), 2)
                    skutecnost = round(plan * random.uniform(0.7, 1.3), 2)
                    rows.append((
                        strid, ucet, f'{year}-{month:02d}',
                        plan, skutecnost, round(skutecnost - plan, 2),
                        round((skutecnost - plan) / plan * 100, 1),
                    ))

    return save(pd.DataFrame(rows, columns=[
        'stredisko_id','ucet_cislo','obdobi','plan','skutecnost','odchylka','odchylka_pct']),
        'fact_budget.csv')


# ============================================================
# MAIN
# ============================================================

def main():
    print("=" * 60)
    print("  FINANCIAL CONTROLLING DATASET GENERATOR")
    print("=" * 60)
    print(f"\n  Output: {OUTPUT_DIR}\n")

    print("\n── Dimension Tables ──")
    regiony = gen_regiony()
    pobocky = gen_pobocky(regiony)
    strediska = gen_strediska(pobocky)
    profit_centra = gen_profit_centra(regiony)
    projekty = gen_projekty()
    ucty = gen_ucty()
    zamestnanci = gen_zamestnanci(strediska)
    produkty = gen_produkty()
    zakaznici = gen_zakaznici(regiony)
    dodavatele = gen_dodavatele()

    print("\n── Fact Tables ──")
    gen_transakce(ucty, strediska, projekty, profit_centra, pobocky, n=1500000)
    gen_mzdy(zamestnanci)
    gen_prodeje(zakaznici, produkty, pobocky, n=350000)
    gen_nakupy(dodavatele, produkty, strediska, n=150000)
    gen_vyrobni_zakazky(produkty, strediska, n=60000)
    gen_cashflow(pobocky, ucty, n=250000)
    gen_budget(strediska, ucty)

    print("\n" + "=" * 60)
    print("  ALL DONE!")
    total_files = len([f for f in os.listdir(OUTPUT_DIR) if f.endswith('.csv')])
    total_size = sum(os.path.getsize(os.path.join(OUTPUT_DIR, f))
                     for f in os.listdir(OUTPUT_DIR) if f.endswith('.csv'))
    print(f"  Files: {total_files}")
    print(f"  Total size: {total_size / 1024 / 1024:.1f} MB")
    print("=" * 60)


if __name__ == '__main__':
    main()
