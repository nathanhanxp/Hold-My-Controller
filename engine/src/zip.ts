import JSZip from "jszip";

/** Build a zip from a name -> text map. Same function in the browser and on the server. */
export async function zipFiles(files: Record<string, string | Uint8Array>, type: "uint8array" | "blob" = "uint8array"): Promise<Uint8Array | Blob> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return type === "blob" ? zip.generateAsync({ type: "blob" }) : zip.generateAsync({ type: "uint8array" });
}

export async function unzipNames(data: Uint8Array): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(data);
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) if (!zip.files[name].dir) out[name] = await zip.files[name].async("string");
  return out;
}
