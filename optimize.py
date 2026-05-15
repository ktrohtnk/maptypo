import json

with open("fukuoka_yakuin.json") as f:
    data = json.load(f)

elements = data["ways"]["elements"]
nodes = {}
for el in elements:
    if el["type"] == "node":
        nodes[el["id"]] = [round(el["lat"], 5), round(el["lon"], 5)]

ways = []
for el in elements:
    if el["type"] == "way" and "nodes" in el:
        way_coords = [nodes.get(nid) for nid in el["nodes"]]
        way_coords = [c for c in way_coords if c]
        if way_coords:
            ways.append(way_coords)

out = {
    "loc": data["loc"],
    "ways": ways
}

with open("fukuoka_yakuin_optimized.json", "w") as f:
    json.dump(out, f, separators=(',', ':'))

print("Optimized!")
