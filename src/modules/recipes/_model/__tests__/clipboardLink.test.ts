import { describe, expect, it } from "vitest";

import { clipboardLinkOf } from "../clipboardLink";

describe("clipboardLinkOf", () => {
  it("offers an address that spells out its scheme", () => {
    expect(clipboardLinkOf("https://www.marmiton.org/recettes/tarte.aspx")).toBe(
      "https://www.marmiton.org/recettes/tarte.aspx",
    );
    expect(clipboardLinkOf("http://blog.example.fr/gratin")).toBe("http://blog.example.fr/gratin");
  });

  it("does not care how the scheme is cased, as the phone's keyboard may have capitalised it", () => {
    expect(clipboardLinkOf("HTTPS://www.marmiton.org/recettes")).toBe("https://www.marmiton.org/recettes");
  });

  it("offers the link alone when the copy came with blanks or words around it", () => {
    expect(clipboardLinkOf("  https://vm.tiktok.com/ZMabc/\n")).toBe("https://vm.tiktok.com/ZMabc/");
    expect(clipboardLinkOf("Regarde cette recette ! https://vm.tiktok.com/ZMabc/")).toBe(
      "https://vm.tiktok.com/ZMabc/",
    );
  });

  it("offers the link alone when the words around it touch it", () => {
    expect(clipboardLinkOf("Recette:https://vm.tiktok.com/ZMabc/")).toBe("https://vm.tiktok.com/ZMabc/");
    expect(clipboardLinkOf("(https://www.marmiton.org/recettes)")).toBe("https://www.marmiton.org/recettes");
    expect(clipboardLinkOf("Ma recette (https://www.marmiton.org/recettes), à tester")).toBe(
      "https://www.marmiton.org/recettes",
    );
  });

  it("offers a link glued to ordinary punctuation", () => {
    expect(clipboardLinkOf("Regarde ça...https://vm.tiktok.com/ZMabc/")).toBe("https://vm.tiktok.com/ZMabc/");
    expect(clipboardLinkOf("Recette-https://www.marmiton.org/recettes")).toBe("https://www.marmiton.org/recettes");
  });

  it("stops at a bracket the address never opened, with words glued after it", () => {
    expect(clipboardLinkOf("[tarte](https://www.marmiton.org/r)suite")).toBe("https://www.marmiton.org/r");
  });

  it("keeps a bracket the address opened itself", () => {
    expect(clipboardLinkOf("Voir https://fr.wikipedia.org/wiki/Tarte_(cuisine) !")).toBe(
      "https://fr.wikipedia.org/wiki/Tarte_(cuisine)",
    );
  });

  it("splits two links joined by a comma, and keeps a link carried inside another", () => {
    expect(clipboardLinkOf("https://www.marmiton.org/a,https://www.marmiton.org/b")).toBe(
      "https://www.marmiton.org/a",
    );
    expect(clipboardLinkOf("https://l.example.com/out?u=https://www.marmiton.org/a")).toBe(
      "https://l.example.com/out?u=https://www.marmiton.org/a",
    );
  });

  it("offers the first link when the text holds several", () => {
    expect(clipboardLinkOf("https://www.marmiton.org/a puis https://www.marmiton.org/b")).toBe(
      "https://www.marmiton.org/a",
    );
  });

  it("stops at a quote or a bracket, which an address cannot hold", () => {
    expect(clipboardLinkOf('<a href="https://www.marmiton.org/recettes">tarte</a>')).toBe(
      "https://www.marmiton.org/recettes",
    );
  });

  it("moves on to the next link when the first is not a web address", () => {
    expect(clipboardLinkOf("test http://localhost:3000 puis https://www.marmiton.org/recettes")).toBe(
      "https://www.marmiton.org/recettes",
    );
  });

  it("offers nothing for a bare host, which the field itself would accept", () => {
    expect(clipboardLinkOf("marmiton.org/recettes/tarte")).toBeUndefined();
    expect(clipboardLinkOf("merci.bien")).toBeUndefined();
  });

  it("offers nothing for text that is not a link", () => {
    expect(clipboardLinkOf("")).toBeUndefined();
    expect(clipboardLinkOf("200g de farine, 3 oeufs")).toBeUndefined();
  });

  it("offers nothing for another scheme, even one that ends in http", () => {
    expect(clipboardLinkOf("ftp://marmiton.org/recette")).toBeUndefined();
    expect(clipboardLinkOf("xhttp://marmiton.org/recette")).toBeUndefined();
    expect(clipboardLinkOf("mailto:chef@marmiton.org")).toBeUndefined();
  });

  it("offers nothing for an http address with no real host", () => {
    expect(clipboardLinkOf("http://localhost:3000")).toBeUndefined();
  });
});
