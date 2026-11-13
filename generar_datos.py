"""Genera web/data.js a partir de data/processed.

Uso:  python web/generar_datos.py

Lee fact_ventas.csv, dim_zona.csv, dim_tipo_vivienda.csv y dim_segmento_precio.csv, codifica
las 21.597 ventas en arrays columnares compactos. Solo usa la biblioteca estándar.

Codificación:
- Enteros: precio (USD), m2 (m² construidos × 100), lat y lon (grados × 10.000), año de
  construcción e índice de zona (posición en dim_zona; son 70 zonas y no caben en un carácter
  base36, por eso van como entero).
- Categóricas: una cadena por columna con un carácter base36 por fila. El carácter es el
  índice (desde 0) dentro del diccionario correspondiente en DATOS.dic, salvo habitaciones y
  baños, donde el carácter es el propio número.
"""

import csv
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PROCESADOS = RAIZ / "data" / "processed"
DATOS_JS = Path(__file__).resolve().parent / "data.js"

B36 = "0123456789abcdefghijklmnopqrstuvwxyz"
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
CALIDADES = ["Baja", "Media", "Alta", "Lujo"]
VISTAS = ["Sin vista", "Regular", "Buena", "Muy buena", "Excelente"]


def leer(nombre):
    with open(PROCESADOS / nombre, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def car(i):
    if not 0 <= i < 36:
        raise ValueError(f"valor fuera de rango base36: {i}")
    return B36[i]


def booleano(v):
    return v.strip().lower() in ("true", "1")


def main():
    hechos = leer("fact_ventas.csv")
    zonas = leer("dim_zona.csv")
    tipos = sorted(leer("dim_tipo_vivienda.csv"), key=lambda r: int(r["tipo_key"]))
    segmentos = sorted(leer("dim_segmento_precio.csv"), key=lambda r: int(r["orden"]))

    zonas.sort(key=lambda r: r["zipcode"])
    idx_zona = {r["zipcode"]: i for i, r in enumerate(zonas)}
    ciudades = sorted({r["ciudad"] for r in zonas})
    idx_tipo = {r["tipo_key"]: i for i, r in enumerate(tipos)}
    idx_seg = {r["segmento_key"]: i for i, r in enumerate(segmentos)}
    decadas = sorted({r["decada_construccion"] for r in hechos})
    idx_dec = {d: i for i, d in enumerate(decadas)}
    meses_clave = sorted({r["fecha_key"][:6] for r in hechos})
    idx_mes = {m: i for i, m in enumerate(meses_clave)}

    cols = {k: [] for k in ("precio", "m2", "lat", "lon", "anio", "zona")}
    cat = {k: [] for k in ("tipo", "seg", "hab", "banos", "calidad", "vista",
                           "agua", "sotano", "renov", "decada", "mes")}

    for r in hechos:
        cols["precio"].append(round(float(r["price"])))
        cols["m2"].append(round(float(r["m2_construidos"]) * 100))
        cols["lat"].append(round(float(r["lat"]) * 10000))
        cols["lon"].append(round(float(r["long"]) * 10000))
        cols["anio"].append(int(r["yr_built"]))
        cols["zona"].append(idx_zona[r["zipcode"]])
        cat["tipo"].append(car(idx_tipo[r["tipo_key"]]))
        cat["seg"].append(car(idx_seg[r["segmento_key"]]))
        cat["hab"].append(car(int(r["bedrooms"])))
        cat["banos"].append(car(int(r["banos_grupo"])))
        cat["calidad"].append(car(CALIDADES.index(r["categoria_calidad"])))
        cat["vista"].append(car(int(r["view"])))
        cat["agua"].append(car(int(booleano(r["frente_agua"]))))
        cat["sotano"].append(car(int(booleano(r["tiene_sotano"]))))
        cat["renov"].append(car(int(booleano(r["fue_renovada"]))))
        cat["decada"].append(car(idx_dec[r["decada_construccion"]]))
        cat["mes"].append(car(idx_mes[r["fecha_key"][:6]]))

    datos = {
        "n": len(hechos),
        **cols,
        "cat": {k: "".join(v) for k, v in cat.items()},
        "dic": {
            "zonas": [[z["zona"], ciudades.index(z["ciudad"]), z["zipcode"]] for z in zonas],
            "ciudades": ciudades,
            "tipos": [t["tipo_vivienda"] for t in tipos],
            "segmentos": [s["segmento_precio"] for s in segmentos],
            "calidades": CALIDADES,
            "vistas": VISTAS,
            "decadas": decadas,
            "meses": [f"{MESES[int(m[4:]) - 1]} {m[:4]}" for m in meses_clave],
        },
    }
    bloque = "const DATOS = " + json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + ";"

    DATOS_JS.write_text(bloque + "\n", encoding="utf-8", newline="\n")
    print(f"{len(hechos)} ventas escritas en {DATOS_JS.name} ({DATOS_JS.stat().st_size / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    main()
