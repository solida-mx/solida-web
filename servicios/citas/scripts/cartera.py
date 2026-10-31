#!/usr/bin/env python3
"""La cartera de servicios de un negocio, en Excel.

  python3 scripts/cartera.py plantilla cartera-de-servicios.xlsx
      Hace la plantilla vacía (con un ejemplo) para mandarle al cliente.

  python3 scripts/cartera.py leer archivo.xlsx <negocio>
      Lee la plantilla llenada y deja dos archivos junto a ella:
        <negocio>.cartera.json   la cartera, para revisarla
        <negocio>.cartera.sql    para cargarla:  npx wrangler d1 execute solida-citas --remote --file <negocio>.cartera.sql
      Si algo no se entiende (una duración sin número, un diseño de un servicio que no existe), lo dice y no escribe nada.

Requiere openpyxl (pip install openpyxl). Sólo se usa en la compu de Solida, no en el servidor.
"""
import json, re, sys
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

NEGRO, ORO, CREMA = "161412", "C9A96E", "F3EAD8"
CAB = [("Servicios", ["Servicio", "Grupo", "Duración (minutos)", "Precio", "¿Precio «desde»? (sí/no)", "Quién lo hace (vacío = cualquiera)"],
        [["Gelish en manos", "Uñas", 60, 280, "no", ""], ["Acrílico esculpido", "Uñas", 120, 450, "sí", "Mía"], ["Volumen ruso", "Pestañas", 150, 850, "no", "Fernanda"]],
        [34, 18, 20, 12, 24, 32]),
       ("Diseños", ["Diseño o variante", "Para el servicio (igual que en Servicios)", "Costo extra", "Tiempo extra (minutos)"],
        [["French clásico", "Gelish en manos", 40, 0], ["Chrome perla", "Gelish en manos", 80, 15]], [30, 40, 14, 22]),
       ("Largos", ["Largo o tamaño", "Costo extra", "Aplica en el grupo"], [["Corto", 0, "Uñas"], ["Medio", 0, "Uñas"], ["Largo", 50, "Uñas"]], [22, 14, 22]),
       ("Anticipo", ["Anticipo para apartar"], [[100]], [26])]

def plantilla(salida):
    wb = Workbook(); ws = wb.active; ws.title = "Instrucciones"
    linea = Side(style="thin", color="E2D9CA")
    ws["A1"] = "Tu cartera de servicios"; ws["A1"].font = Font(name="Georgia", size=20, color=NEGRO)
    textos = ["Llena una hoja por tema. Los renglones grises son un ejemplo: bórralos o escribe encima.",
              "Servicios: lo que ofreces, cuánto dura y cuánto cuesta. El grupo sirve para ordenarlos (Uñas, Pestañas, Cortes…).",
              "Diseños: variantes de un servicio que suman al precio (y al tiempo, si tardan más). Escribe el servicio igual que en la hoja Servicios.",
              "Largos: tamaños que suman al precio en un grupo (por ejemplo, uñas largas +$50). Si no manejas, déjala vacía.",
              "Anticipo: lo que pides para apartar. Vacío si no pides.",
              "Después, los precios los cambias tú desde tu agenda (Mis servicios) cuando quieras: siempre se usa el más reciente."]
    for i, t in enumerate(textos, start=3):
        ws.cell(row=i, column=1, value=t).alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[i].height = 32
    ws.column_dimensions["A"].width = 110
    for nombre, cab, ejemplo, anchos in CAB:
        h = wb.create_sheet(nombre)
        for j, (t, w) in enumerate(zip(cab, anchos), start=1):
            c = h.cell(row=1, column=j, value=t)
            c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor=NEGRO)
            c.alignment = Alignment(wrap_text=True, vertical="center"); c.border = Border(bottom=Side(style="medium", color=ORO))
            h.column_dimensions[c.column_letter].width = w
        h.row_dimensions[1].height = 34
        for i, fila in enumerate(ejemplo, start=2):
            for j, v in enumerate(fila, start=1):
                c = h.cell(row=i, column=j, value=v); c.font = Font(color="8A8178", italic=True); c.border = Border(bottom=linea)
        h.freeze_panes = "A2"
        if nombre == "Servicios":
            dv = DataValidation(type="list", formula1='"sí,no"', allow_blank=True); h.add_data_validation(dv); dv.add("E2:E200")
        for col in ("Precio", "Costo extra", "Anticipo para apartar"):
            if col in cab:
                letra = h.cell(row=1, column=cab.index(col) + 1).column_letter
                for r in range(2, 201): h[f"{letra}{r}"].number_format = '"$"#,##0'
    wb.save(salida); print("Plantilla:", salida)

def num(v, que, errores, donde):
    if v is None or str(v).strip() == "": return 0
    m = re.sub(r"[^\d.]", "", str(v))
    if not m: errores.append(f"{donde}: «{v}» no es un número ({que})"); return 0
    return int(round(float(m)))

def leer(archivo, negocio):
    wb = load_workbook(archivo, data_only=True); errores = []
    filas = lambda hoja: [r for r in wb[hoja].iter_rows(min_row=2, values_only=True) if r and any(x not in (None, "") for x in r)] if hoja in wb.sheetnames else []
    servicios, nombres = [], set()
    for i, r in enumerate(filas("Servicios"), start=2):
        nombre = str(r[0] or "").strip()
        if not nombre: continue
        if nombre.lower() in nombres: errores.append(f"Servicios fila {i}: «{nombre}» está repetido"); continue
        nombres.add(nombre.lower())
        quien = [re.sub(r"[^a-z0-9_-]", "", q.strip().lower().translate(str.maketrans("áéíóúñü", "aeiounu"))) for q in str(r[5] or "").split(",") if q.strip()] if len(r) > 5 else []
        servicios.append({"nombre": nombre, "cat": str(r[1] or "").strip(), "min": num(r[2], "duración", errores, f"Servicios fila {i}") or 60,
                          "precio": num(r[3], "precio", errores, f"Servicios fila {i}"), "desde": str(r[4] or "").strip().lower() in ("sí", "si", "x", "1", "yes"), "quien": quien})
    variantes = []
    for i, r in enumerate(filas("Diseños"), start=2):
        nombre, serv = str(r[0] or "").strip(), str(r[1] or "").strip()
        if not nombre: continue
        if serv.lower() not in nombres: errores.append(f"Diseños fila {i}: el servicio «{serv}» no está en la hoja Servicios"); continue
        variantes.append({"nombre": nombre, "servicio": serv, "extra": num(r[2], "costo extra", errores, f"Diseños fila {i}"), "extraMin": num(r[3] if len(r) > 3 else 0, "tiempo extra", errores, f"Diseños fila {i}")})
    largos, en = [], []
    for i, r in enumerate(filas("Largos"), start=2):
        if not str(r[0] or "").strip(): continue
        largos.append({"nombre": str(r[0]).strip(), "extra": num(r[1], "costo extra", errores, f"Largos fila {i}")})
        g = str(r[2] or "").strip() if len(r) > 2 else ""
        if g and g not in en: en.append(g)
    ant = filas("Anticipo"); anticipo = num(ant[0][0], "anticipo", errores, "Anticipo") if ant else 0
    if not servicios: errores.append("La hoja Servicios está vacía")
    if errores:
        print("No se cargó nada. Revisa:"); [print(" -", e) for e in errores]; sys.exit(1)
    cartera = {"servicios": servicios, "variantes": variantes, "largos": largos, "largosEn": en, "anticipo": anticipo}
    escribe(cartera, negocio, re.sub(r"\.xlsx$", "", archivo, flags=re.I))

def escribe(cartera, negocio, base):
    if not re.fullmatch(r"[a-z0-9-]{2,40}", negocio): sys.exit("El negocio va en minúsculas, números y guiones")
    js = json.dumps(cartera, ensure_ascii=False)
    open(base + ".cartera.json", "w").write(json.dumps(cartera, ensure_ascii=False, indent=1))
    open(base + ".cartera.sql", "w").write("UPDATE negocios SET servicios='" + js.replace("'", "''") + "' WHERE id='" + negocio + "';\n")
    print(f"{len(cartera['servicios'])} servicios, {len(cartera['variantes'])} diseños, {len(cartera['largos'])} largos, anticipo ${cartera['anticipo']}")
    print("Revisa", base + ".cartera.json", "y carga con:  npx wrangler d1 execute solida-citas --remote --file", base + ".cartera.sql")

if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) == 2 and a[0] == "plantilla": plantilla(a[1])
    elif len(a) == 3 and a[0] == "leer": leer(a[1], a[2])
    else: print(__doc__); sys.exit(2)
