/* CalcPronto calculators. Same rules as the CalcPronto AI tools (MCP server).
   No tracking, no dependencies. Every page sets window.CP = {lang, locale, currency, t, page}. */
(function () {
  "use strict";
  var CP = window.CP || {};
  var T = CP.t || {};
  var LOCALE = CP.locale || "en-US";

  // ------------------------------------------------------------ helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function t(key, vars) {
    var s = T[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }
  function num(v) {
    if (v === null || v === undefined) return NaN;
    var s = String(v).trim().replace(/[\s  ']/g, "");
    if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) {
      s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else {
      s = s.replace(",", ".");
    }
    return s === "" ? NaN : Number(s);
  }
  function val(id) { var el = document.getElementById(id); return el ? num(el.value) : NaN; }
  function fmt(x, digits) {
    if (!isFinite(x)) return "—";
    var d = digits === undefined ? 2 : digits;
    return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
  }
  function money(x, cur) {
    if (!isFinite(x)) return "—";
    try {
      return new Intl.NumberFormat(LOCALE, { style: "currency", currency: cur || CP.currency || "EUR" }).format(x);
    } catch (e) { return fmt(x) + " " + (cur || ""); }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Stacked bar showing how a total splits (parts: [{l: label, v: value}], zero or missing parts are dropped).
  var CHART_COLORS = ["#0b6e4f", "#f2a900", "#5b7c99", "#b42318"];
  function chart(parts) {
    parts = parts.filter(function (p) { return isFinite(p.v) && p.v > 0; });
    var total = parts.reduce(function (a, p) { return a + p.v; }, 0);
    if (parts.length < 2 || !(total > 0)) return "";
    var bar = "", legend = "";
    parts.forEach(function (p, i) {
      var pct = p.v / total * 100, col = CHART_COLORS[i % CHART_COLORS.length];
      bar += "<i style='width:" + pct.toFixed(2) + "%;background:" + col + "'></i>";
      legend += "<li><i style='background:" + col + "'></i>" + esc(p.l) + " <span>" + fmt(pct, 1) + (CP.lang === "en" ? "%" : " %") + "</span></li>";
    });
    return "<div class='chart'><div class='chart-bar' aria-hidden='true'>" + bar + "</div><ul class='chart-legend'>" + legend + "</ul></div>";
  }
  // "What next" box under a result: links to the decision guides (CP.tips, set by build.py for the pages that have guides).
  // A tip with a "when" key is shown only if flags[when] is true.
  function tips(flags) {
    var list = (CP.tips || []).filter(function (x) { return !x.when || (flags && flags[x.when]); });
    if (!list.length) return "";
    var h = "<div class='next'><b>" + esc(CP.tipsTitle || "") + "</b><ul>";
    list.forEach(function (x) { h += "<li><span>" + esc(x.text) + "</span><a class='btn' href='" + esc(x.url) + "'>" + esc(x.label) + " →</a></li>"; });
    return h + "</ul></div>";
  }
  function currency() { var el = document.getElementById("currency"); return el ? el.value : (CP.currency || "EUR"); }

  // Dates as day numbers (UTC) to avoid time-zone and DST issues.
  function dayNum(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    if (!m) return NaN;
    var d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var back = new Date(d);
    if (back.getUTCMonth() !== +m[2] - 1) return NaN;
    return Math.round(d / 86400000);
  }
  function isoOf(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  function showDate(n) {
    return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(n * 86400000));
  }
  function weekday(n) { return new Date(n * 86400000).getUTCDay(); } // 0 = Sunday
  function todayNum() {
    var d = new Date();
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }

  // ------------------------------------------------------------ loans (same formulas as loancalc engine)
  function payment(P, r, n) {
    if (n <= 0) return NaN;
    if (r === 0) return P / n;
    return P * r / (1 - Math.pow(1 + r, -n));
  }

  var Loan = {
    compute: function (P, ratePct, years, insPct, fees) {
      var n = Math.round(years * 12), r = ratePct / 100 / 12;
      var pay = payment(P, r, n);
      var ins = P * (insPct || 0) / 100 / 12;
      var rows = [], bal = P, acc = { paid: 0, interest: 0, principal: 0 };
      for (var k = 1; k <= n && bal > 0.005; k++) {
        var it = bal * r, pr = Math.min(pay - it, bal);
        bal -= pr;
        acc.paid += it + pr; acc.interest += it; acc.principal += pr;
        if (k % 12 === 0 || k === n || bal <= 0.005) {
          rows.push({ year: Math.ceil(k / 12), paid: acc.paid, interest: acc.interest, principal: acc.principal, balance: Math.max(bal, 0) });
          acc = { paid: 0, interest: 0, principal: 0 };
        }
      }
      var interest = pay * n - P;
      return { n: n, payment: pay, insurance: ins, paymentWithIns: pay + ins, interest: interest,
        totalIns: ins * n, fees: fees || 0, cost: interest + ins * n + (fees || 0), repaid: pay * n + ins * n, rows: rows };
    },
    render: function () {
      var P = val("loan-amount"), rate = val("loan-rate"), years = val("loan-years");
      var ins = val("loan-ins"); if (!isFinite(ins)) ins = 0;
      var fees = val("loan-fees"); if (!isFinite(fees)) fees = 0;
      var out = $("#result");
      if (!(P > 0) || !(rate >= 0 && rate <= 100) || !(years > 0 && years <= 50)) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
      if (ins > 5 || ins < 0) { out.innerHTML = "<p class='warn'>" + t("ins_too_high", { v: fmt(ins, 2) }) + "</p>"; return; }
      var c = currency(), res = Loan.compute(P, rate, years, ins, fees);
      var h = "<div class='big'><span>" + t("monthly_payment") + "</span><strong>" + money(res.payment, c) + "</strong></div>";
      if (ins > 0) h += "<div class='kv'><span>" + t("payment_with_insurance") + "</span><b>" + money(res.paymentWithIns, c) + "</b></div>";
      h += "<div class='kv'><span>" + t("number_of_payments") + "</span><b>" + res.n + "</b></div>";
      h += "<div class='kv'><span>" + t("total_interest") + "</span><b>" + money(res.interest, c) + "</b></div>";
      if (ins > 0) h += "<div class='kv'><span>" + t("total_insurance") + "</span><b>" + money(res.totalIns, c) + "</b></div>";
      if (fees > 0) h += "<div class='kv'><span>" + t("fees") + "</span><b>" + money(res.fees, c) + "</b></div>";
      h += "<div class='kv total'><span>" + t("total_cost") + "</span><b>" + money(res.cost, c) + "</b></div>";
      h += chart([{ l: t("ch_capital"), v: P }, { l: t("total_interest"), v: res.interest }, { l: t("total_insurance"), v: ins > 0 ? res.totalIns : 0 }, { l: t("fees"), v: fees > 0 ? res.fees : 0 }]);
      h += "<details><summary>" + t("amortization_table") + "</summary><div class='table-wrap'><table><thead><tr><th>" + t("year") + "</th><th>" + t("paid") + "</th><th>" + t("interest") + "</th><th>" + t("principal") + "</th><th>" + t("balance") + "</th></tr></thead><tbody>";
      res.rows.forEach(function (r) {
        h += "<tr><td>" + r.year + "</td><td>" + money(r.paid, c) + "</td><td>" + money(r.interest, c) + "</td><td>" + money(r.principal, c) + "</td><td>" + money(r.balance, c) + "</td></tr>";
      });
      h += "</tbody></table></div></details>";
      out.innerHTML = h;
    }
  };

  var Capacity = {
    compute: function (income, debts, ratePct, years, ratio, insPct, down) {
      var budget = income * ratio / 100 - debts;
      if (budget <= 0) return { budget: 0, loan: 0, purchase: down };
      var n = Math.round(years * 12), r = ratePct / 100 / 12;
      var unit = payment(1, r, n) + (insPct || 0) / 100 / 12;
      var loan = budget / unit;
      // What the n payments repay over the loan: capital, interest, insurance (same formulas as Loan.compute)
      var interest = payment(loan, r, n) * n - loan, insurance = loan * (insPct || 0) / 100 / 12 * n;
      return { budget: budget, loan: loan, purchase: loan + down, n: n, interest: interest, insurance: insurance };
    },
    render: function () {
      var inc = val("cap-income"), debts = val("cap-debts"), rate = val("cap-rate"), years = val("cap-years"), ratio = val("cap-ratio");
      var ins = val("cap-ins"), down = val("cap-down");
      if (!isFinite(debts)) debts = 0; if (!isFinite(ins)) ins = 0; if (!isFinite(down)) down = 0;
      var out = $("#result");
      if (!(inc > 0) || !(rate >= 0) || !(years > 0 && years <= 40) || !(ratio > 0 && ratio <= 100)) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
      if (ins > 5 || ins < 0) { out.innerHTML = "<p class='warn'>" + t("ins_too_high", { v: fmt(ins, 2) }) + "</p>"; return; }
      var c = currency(), res = Capacity.compute(inc, debts, rate, years, ratio, ins, down);
      if (res.budget <= 0) { out.innerHTML = "<p class='warn'>" + t("cap_no_room") + "</p>"; return; }
      var h = "<div class='big'><span>" + t("max_loan") + "</span><strong>" + money(res.loan, c) + "</strong></div>";
      h += chart([{ l: t("ch_capital"), v: res.loan }, { l: t("total_interest"), v: res.interest }, { l: t("total_insurance"), v: res.insurance }]);
      h += "<div class='kv'><span>" + t("max_monthly_payment") + "</span><b>" + money(res.budget, c) + "</b></div>";
      h += "<div class='kv'><span>" + t("total_interest") + "</span><b>" + money(res.interest, c) + "</b></div>";
      if (ins > 0) h += "<div class='kv'><span>" + t("total_insurance") + "</span><b>" + money(res.insurance, c) + "</b></div>";
      if (down > 0) h += "<div class='kv total'><span>" + t("max_purchase") + "</span><b>" + money(res.purchase, c) + "</b></div>";
      h += "<p class='small'>" + t("cap_explain", { ratio: fmt(ratio, ratio % 1 ? 1 : 0), income: money(inc, c), debts: money(debts, c), budget: money(res.budget, c) }) + "</p>";
      out.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ VAT
  var VAT = {
    rates: CP.vatRates || {},
    // num / den rounded half away from zero, exact for integers up to 2^53 (den > 0)
    halfUp: function (num, den) {
      var s = num < 0 ? -1 : 1, a = Math.abs(num), q = Math.floor(a / den), r = a - q * den;
      while (r < 0) { q--; r += den; }
      while (r >= den) { q++; r -= den; }
      return s * (2 * r >= den ? q + 1 : q);
    },
    fillRates: function () {
      var cc = $("#vat-country").value, sel = $("#vat-rate"), r = VAT.rates[cc];
      if (!r) return;
      var list = [r.standard].concat(r.reduced || []);
      if (r.super_reduced) list.push(r.super_reduced);
      sel.innerHTML = list.map(function (x, i) {
        return "<option value='" + x + "'>" + fmt(x, x % 1 ? 1 : 0) + " %" + (i === 0 ? " (" + t("standard_rate") + ")" : "") + "</option>";
      }).join("") + "<option value='custom'>" + t("custom_rate") + "</option>";
      VAT.toggleCustom();
    },
    toggleCustom: function () {
      var box = $("#vat-custom-box");
      if (box) box.hidden = $("#vat-rate").value !== "custom";
    },
    render: function () {
      var amount = val("vat-amount"), mode = $("#vat-mode").value;
      var rateSel = $("#vat-rate").value, rate = rateSel === "custom" ? val("vat-custom") : num(rateSel);
      var out = $("#result");
      if (!isFinite(amount) || !(rate >= 0 && rate < 100)) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
      // Same rule as the euvat engine, in whole cents: one figure is rounded half-up, the other two follow from it,
      // so net + VAT = gross. Integer maths avoids float errors on exact half cents (36,15 € TTC at 20 % -> 30,13 € HT).
      var R = Math.round(rate * 10000), cents = VAT.halfUp(Math.round(amount * 1000), 10), netC, vatC, grossC;
      if (mode === "net") { netC = cents; vatC = VAT.halfUp(netC * R, 1000000); grossC = netC + vatC; }
      else { grossC = cents; netC = VAT.halfUp(grossC * 1000000, 1000000 + R); vatC = grossC - netC; }
      var net = netC / 100, vat = vatC / 100, gross = grossC / 100;
      var c = currency();
      var h = "<div class='kv'><span>" + t("net_amount") + "</span><b>" + money(net, c) + "</b></div>";
      h += "<div class='kv'><span>" + t("vat_amount", { rate: fmt(rate, rate % 1 ? 1 : 0) }) + "</span><b>" + money(vat, c) + "</b></div>";
      h += "<div class='big'><span>" + t("gross_amount") + "</span><strong>" + money(gross, c) + "</strong></div>";
      h += "<p class='small'>" + (mode === "net" ? t("vat_formula_net", { rate: fmt(rate, rate % 1 ? 1 : 0) }) : t("vat_formula_gross", { rate: fmt(rate, rate % 1 ? 1 : 0) })) + "</p>";
      h += tips({ fr: $("#vat-country").value === "FR" });              // French rules: only when France is selected
      out.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ Schengen 90/180 (same rules as schengen engine)
  var Schengen = {
    LIMIT: 90, WINDOW: 180,
    collect: function () {
      var days = {}, errors = [];
      $all(".stay-row").forEach(function (row, i) {
        var a = dayNum($("input[name=entry]", row).value), b = dayNum($("input[name=exit]", row).value);
        if (isNaN(a) && isNaN(b)) return;
        if (isNaN(a)) { errors.push(t("sch_err_entry", { n: i + 1 })); return; }
        if (isNaN(b)) b = a;
        if (b < a) { errors.push(t("sch_err_order", { n: i + 1 })); return; }
        for (var d = a; d <= b && d - a < 3650; d++) days[d] = true;
      });
      return { days: Object.keys(days).map(Number).sort(function (x, y) { return x - y; }), errors: errors };
    },
    // number of sorted day numbers within [lo, hi] (binary search, like bisect in the Python engine)
    count: function (sorted, lo, hi) {
      if (hi < lo) return 0;
      function bound(x, strict) {
        var a = 0, b = sorted.length;
        while (a < b) { var m = (a + b) >> 1; if (strict ? sorted[m] <= x : sorted[m] < x) a = m + 1; else b = m; }
        return a;
      }
      return bound(hi, true) - bound(lo, false);
    },
    usedOn: function (sorted, d) { return Schengen.count(sorted, d - Schengen.WINDOW + 1, d); },
    usedWithTrip: function (past, start, d) {
      var lo = d - Schengen.WINDOW + 1, tlo = Math.max(start, lo);
      var trip = d >= tlo ? d - tlo + 1 : 0;
      return Schengen.count(past, lo, d) - Schengen.count(past, tlo, d) + trip;
    },
    latestExit: function (days, entry) {
      var past = days.filter(function (d) { return d < entry; });
      if (Schengen.usedWithTrip(past, entry, entry) > Schengen.LIMIT) return null;
      var d = entry;
      while (Schengen.usedWithTrip(past, entry, d) <= Schengen.LIMIT && d - entry < 400) d++;
      return d - 1;
    },
    earliestEntry: function (days, length, notBefore) {
      for (var off = 0; off < 800; off++) {
        var s = notBefore + off, past = days.filter(function (d) { return d < s; }), ok = true;
        for (var d = s; d < s + length; d++) { if (Schengen.usedWithTrip(past, s, d) > Schengen.LIMIT) { ok = false; break; } }
        if (ok) return s;
      }
      return null;
    },
    addRow: function (entry, exit) {
      var tpl = $("#stay-template"), box = $("#stays");
      var node = tpl.content.firstElementChild.cloneNode(true);
      if (entry) $("input[name=entry]", node).value = entry;
      if (exit) $("input[name=exit]", node).value = exit;
      $("button.remove", node).addEventListener("click", function () { node.remove(); Schengen.render(); });
      $all("input", node).forEach(function (el) { el.addEventListener("input", Schengen.render); el.addEventListener("change", Schengen.render); });
      box.appendChild(node);
    },
    render: function () {
      var out = $("#result"), data = Schengen.collect();
      var control = dayNum($("#sch-control").value); if (isNaN(control)) control = todayNum();
      if (data.errors.length) { out.innerHTML = "<p class='warn'>" + data.errors.map(esc).join("<br>") + "</p>"; return; }
      var used = Schengen.usedOn(data.days, control), left = Math.max(Schengen.LIMIT - used, 0);
      var h = "<div class='big'><span>" + t("sch_days_left", { date: showDate(control) }) + "</span><strong>" + left + " / 90</strong></div>";
      h += "<div class='kv'><span>" + t("sch_days_used") + "</span><b>" + used + "</b></div>";
      h += "<div class='kv'><span>" + t("sch_window") + "</span><b>" + showDate(control - 179) + " → " + showDate(control) + "</b></div>";
      if (used > 90) h += "<p class='warn'>" + t("sch_overstay", { n: used - 90 }) + "</p>";
      var inWin = data.days.filter(function (d) { return d >= control - 179 && d <= control; });
      if (inWin.length) h += "<div class='kv'><span>" + t("sch_next_release") + "</span><b>" + showDate(inWin[0] + 180) + "</b></div>";
      var entry = dayNum($("#sch-entry").value);
      if (!isNaN(entry)) {
        var last = Schengen.latestExit(data.days, entry);
        if (last === null) {
          var nxt = Schengen.earliestEntry(data.days, 1, entry);
          h += "<p class='warn'>" + t("sch_cannot_enter", { date: showDate(entry) }) + (nxt !== null ? " " + t("sch_earliest", { date: showDate(nxt) }) : "") + "</p>";
        } else {
          h += "<div class='big alt'><span>" + t("sch_latest_exit", { date: showDate(entry) }) + "</span><strong>" + showDate(last) + "</strong></div>";
          h += "<div class='kv'><span>" + t("sch_max_days") + "</span><b>" + (last - entry + 1) + "</b></div>";
        }
      }
      out.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ business days
  var BizDays = {
    cache: {},
    load: function (cc, cb) {
      if (BizDays.cache[cc]) return cb(BizDays.cache[cc]);
      if (CP.holidays && CP.holidays.country === cc) { BizDays.cache[cc] = CP.holidays; return cb(CP.holidays); }
      fetch((CP.base || "/") + "data/holidays/" + cc + ".json").then(function (r) { return r.json(); }).then(function (d) {
        BizDays.cache[cc] = d; cb(d);
      }).catch(function () { $("#result").innerHTML = "<p class='warn'>" + t("load_error") + "</p>"; });
    },
    calendar: function (data, sub) {
      var map = {};
      Object.keys(data.national).forEach(function (k) { map[k] = data.national[k]; });
      var s = sub && data.subdivisions[sub];
      if (s) {
        (s.not_observed || []).forEach(function (k) { delete map[k]; });
        Object.keys(s.extra || {}).forEach(function (k) { map[k] = s.extra[k]; });
      }
      return map;
    },
    name: function (entry) { return entry[CP.lang] || entry.en || Object.keys(entry).map(function (k) { return entry[k]; })[0]; },
    fillSubdivisions: function (data) {
      var sel = $("#bd-region"), box = $("#bd-region-box");
      var keys = Object.keys(data.subdivisions || {});
      if (!keys.length) { box.hidden = true; sel.innerHTML = ""; return; }
      box.hidden = false;
      keys.sort(function (a, b) { return data.subdivisions[a].name.localeCompare(data.subdivisions[b].name); });
      sel.innerHTML = "<option value=''>" + t("bd_national_only") + "</option>" + keys.map(function (k) {
        return "<option value='" + esc(k) + "'>" + esc(data.subdivisions[k].name) + "</option>";
      }).join("");
      if (CP.region && data.subdivisions[CP.region]) sel.value = CP.region;
    },
    inRange: function (data) { return { min: dayNum(data.years[0] + "-01-01"), max: dayNum(data.years[data.years.length - 1] + "-12-31") }; },
    render: function () {
      var cc = $("#bd-country").value;
      BizDays.load(cc, function (data) {
        if ($("#bd-region").dataset.cc !== cc) { BizDays.fillSubdivisions(data); $("#bd-region").dataset.cc = cc; }
        var cal = BizDays.calendar(data, $("#bd-region").value), rng = BizDays.inRange(data);
        var out = $("#result"), mode = $("#bd-mode").value;
        $("#bd-between").hidden = mode !== "between";
        $("#bd-add").hidden = mode !== "add";
        var a = dayNum($("#bd-start").value);
        if (isNaN(a)) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
        var sat = $("#bd-saturday") && $("#bd-saturday").checked;
        function isWeekend(d) { var w = weekday(d); return w === 0 || (w === 6 && !sat); }
        function isWork(d) { return !isWeekend(d) && !cal[isoOf(d)]; }
        var h = "", hits = [];
        if (mode === "between") {
          var b = dayNum($("#bd-end").value);
          if (isNaN(b)) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
          var sign = 1; if (b < a) { var tmp = a; a = b; b = tmp; sign = -1; }
          if (a < rng.min || b > rng.max) { out.innerHTML = "<p class='warn'>" + t("bd_out_of_range", { from: data.years[0], to: data.years[data.years.length - 1] }) + "</p>"; return; }
          var incS = $("#bd-inc-start").checked, incE = $("#bd-inc-end").checked, count = 0, wk = 0;
          for (var d = a; d <= b; d++) {
            if ((d === a && !incS) || (d === b && !incE && d !== a)) continue;
            if (isWeekend(d)) wk++;
            else if (cal[isoOf(d)]) hits.push(d);
            else count++;
          }
          h += "<div class='big'><span>" + t("bd_result_between") + "</span><strong>" + sign * count + "</strong></div>";
          h += "<div class='kv'><span>" + t("bd_calendar_days") + "</span><b>" + (b - a + 1) + "</b></div>";
          h += "<div class='kv'><span>" + t("bd_weekend_days") + "</span><b>" + wk + "</b></div>";
          h += "<div class='kv'><span>" + t("bd_holidays_weekdays") + "</span><b>" + hits.length + "</b></div>";
        } else {
          var n = Math.round(val("bd-n"));
          if (!isFinite(n)) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
          var step = n < 0 ? -1 : 1, left = Math.abs(n), d2 = a;
          while (left > 0) { d2 += step; if (d2 < rng.min || d2 > rng.max) break; if (isWork(d2)) left--; else if (cal[isoOf(d2)] && !isWeekend(d2)) hits.push(d2); }
          if (left > 0) { out.innerHTML = "<p class='warn'>" + t("bd_out_of_range", { from: data.years[0], to: data.years[data.years.length - 1] }) + "</p>"; return; }
          h += "<div class='big'><span>" + t("bd_result_add", { n: n }) + "</span><strong>" + showDate(d2) + "</strong></div>";
          h += "<div class='kv'><span>" + t("bd_calendar_days") + "</span><b>" + Math.abs(d2 - a) + "</b></div>";
        }
        if (hits.length) {
          h += "<details open><summary>" + t("bd_holidays_list") + "</summary><ul class='hol'>" + hits.map(function (d) {
            return "<li><time datetime='" + isoOf(d) + "'>" + showDate(d) + "</time> — " + esc(BizDays.name(cal[isoOf(d)])) + "</li>";
          }).join("") + "</ul></details>";
        }
        out.innerHTML = h;
      });
    }
  };

  // ------------------------------------------------------------ EU261 (same rules as eu261 engine)
  var EU261 = {
    EU: ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","AX","GP","MQ","GF","RE","YT","MF","IS","NO","LI","CH"],
    AMOUNTS: { EU261: { a: 250, b: 400, c: 600, cur: "EUR" }, UK261: { a: 220, b: 350, c: 520, cur: "GBP" } },
    REDUCE: { a: 120, b: 180, c: 240 },
    airports: null,
    zone: function (c) { return c === "GB" ? "UK" : (EU261.EU.indexOf(c) >= 0 ? "EU" : "other"); },
    load: function (cb) {
      if (EU261.airports) return cb();
      fetch((CP.base || "/") + "data/airports.json").then(function (r) { return r.json(); }).then(function (d) {
        EU261.airports = d.airports; EU261.buildIndex(); cb();
      }).catch(function () { $("#result").innerHTML = "<p class='warn'>" + t("load_error") + "</p>"; });
    },
    buildIndex: function () {
      var list = $("#airport-list"); if (!list) return;
      EU261.index = Object.keys(EU261.airports).map(function (k) {
        var a = EU261.airports[k];
        return { code: k, label: k + " — " + (a[4] ? a[4] + ", " : "") + a[3] + " (" + a[2] + ")", key: (k + " " + a[4] + " " + a[3]).toLowerCase() };
      });
    },
    suggest: function (input) {
      var q = input.value.trim().toLowerCase(), list = $("#airport-list");
      if (!EU261.index || q.length < 2) return;
      var exact = [], other = [];
      for (var i = 0; i < EU261.index.length && exact.length + other.length < 40; i++) {
        var it = EU261.index[i];
        if (it.code.toLowerCase() === q) exact.push(it);
        else if (it.key.indexOf(q) >= 0) other.push(it);
      }
      list.innerHTML = exact.concat(other).slice(0, 12).map(function (it) { return "<option value='" + esc(it.label) + "'>"; }).join("");
    },
    code: function (v) {
      var m = /^\s*([A-Za-z]{3})\b/.exec(v || "");
      if (!m) return null;
      var c = m[1].toUpperCase();
      return EU261.airports && EU261.airports[c] ? c : null;
    },
    km: function (a, b) {
      var R = 6371, p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180;
      var dp = p2 - p1, dl = (b[1] - a[1]) * Math.PI / 180;
      var h = Math.pow(Math.sin(dp / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin(dl / 2), 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    },
    band: function (km, intra, regime) {
      if (km <= 1500) return "a";
      if (regime === "EU261" && intra) return "b";
      if (km <= 3500) return "b";
      return "c";
    },
    scope: function (za, zb, carrier) {
      var eu = false, uk = false, why = [];
      if (za === "EU") { eu = true; why.push("eu_dep"); }
      else if (zb === "EU" && carrier === "EU") { eu = true; why.push("eu_arr_eu_carrier"); }
      if (za === "UK") { uk = true; why.push("uk_dep"); }
      else if (zb === "UK" && (carrier === "UK" || carrier === "EU")) { uk = true; why.push("uk_arr"); }
      else if (zb === "EU" && carrier === "UK") { uk = true; why.push("uk_carrier_to_eu"); }
      return { eu: eu, uk: uk, why: why };
    },
    // Small screens: a bar fixed at the bottom repeats the partner button while the action box is out of view.
    sticky: function (amount) {
      var old = document.getElementById("sticky-cta"); if (old) old.remove();
      document.body.classList.remove("has-sticky");
      var box = document.querySelector("#result .action");
      if (!amount || !CP.claimUrl || !box) return;
      var bar = document.createElement("div"); bar.id = "sticky-cta"; bar.className = "sticky-cta";
      bar.innerHTML = "<span><small>" + t("partner_tag") + "</small><b>" + esc(amount) + "</b></span><a class='cta' href='" + esc(CP.claimUrl) + "' rel='sponsored nofollow noopener' target='_blank'>" + t("eu_claim_cta") + " →</a>";
      document.body.appendChild(bar); document.body.classList.add("has-sticky");
      if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { bar.hidden = en[0].isIntersecting; }).observe(box);
    },
    claim: function (o, d, carrier, kind, p) {
      var A = EU261.airports[o], B = EU261.airports[d];
      var za = EU261.zone(A[2]), zb = EU261.zone(B[2]);
      var km = EU261.km(A, B), intra = za === "EU" && zb === "EU";
      var sc = EU261.scope(za, zb, carrier);
      var regimes = []; if (sc.eu) regimes.push("EU261"); if (sc.uk) regimes.push("UK261");
      var res = { km: km, regimes: regimes, scope: sc, results: {} };
      regimes.forEach(function (reg) {
        var cat = EU261.band(km, intra, reg), full = EU261.AMOUNTS[reg][cat], e = { band: cat, amount: 0, eligible: false, why: [], reduction: null, cur: EU261.AMOUNTS[reg].cur };
        if (kind === "delay") {
          if (p.delay < 180) e.why.push("delay_under_3h");
          else if (p.extraordinary) e.why.push("extraordinary");
          else { e.eligible = true; e.amount = full; e.why.push("delay_3h"); if (cat === "c" && p.delay < 240) e.reduction = "reduce_delay_c"; }
        } else if (kind === "cancellation") {
          var early = p.early, late = p.late, exempt = false, n = p.notice;
          if (n >= 14) { exempt = true; e.why.push("cancel_14d"); }
          else if (n >= 7 && early !== null && late !== null && early <= 120 && late < 240) { exempt = true; e.why.push("cancel_7_13_rerouted"); }
          else if (n < 7 && early !== null && late !== null && early <= 60 && late < 120) { exempt = true; e.why.push("cancel_lt7_rerouted"); }
          if (!exempt) {
            if (p.extraordinary) e.why.push("extraordinary");
            else { e.eligible = true; e.amount = full; e.why.push("cancel_due"); if (late !== null && late <= EU261.REDUCE[cat]) e.reduction = "reduce_reroute"; }
          }
        } else {
          if (p.volunteered) e.why.push("db_volunteer");
          else if (p.grounds) e.why.push("db_grounds");
          else { e.eligible = true; e.amount = full; e.why.push("db_due"); if (p.late !== null && p.late <= EU261.REDUCE[cat]) e.reduction = "reduce_reroute"; }
        }
        res.results[reg] = e;
      });
      return res;
    },
    minutes: function (hId, mId) {
      var h = val(hId), m = val(mId);
      if (!isFinite(h) && !isFinite(m)) return null;
      return (isFinite(h) ? h : 0) * 60 + (isFinite(m) ? m : 0);
    },
    render: function () {
      var kind = $("#eu-kind").value;
      $all("[data-kind]").forEach(function (el) { el.hidden = el.dataset.kind.split(" ").indexOf(kind) < 0; });
      EU261.load(function () {
        var out = $("#result"), o = EU261.code($("#eu-from").value), d = EU261.code($("#eu-to").value);
        if (!o || !d) { out.innerHTML = "<p class='hint'>" + t("eu_pick_airports") + "</p>"; return; }
        if (o === d) { out.innerHTML = "<p class='warn'>" + t("eu_same_airport") + "</p>"; return; }
        var p = {
          delay: EU261.minutes("eu-delay-h", "eu-delay-m"),
          notice: val("eu-notice"),
          early: EU261.minutes("eu-early-h", "eu-early-m"),
          late: EU261.minutes("eu-late-h", "eu-late-m"),
          extraordinary: $("#eu-extra").checked,
          volunteered: $("#eu-volunteer") && $("#eu-volunteer").checked,
          grounds: $("#eu-grounds") && $("#eu-grounds").checked
        };
        if (kind === "delay" && p.delay === null) { out.innerHTML = "<p class='hint'>" + t("eu_enter_delay") + "</p>"; return; }
        if (kind === "cancellation" && !isFinite(p.notice)) { out.innerHTML = "<p class='hint'>" + t("eu_enter_notice") + "</p>"; return; }
        var res = EU261.claim(o, d, $("#eu-carrier").value, kind, p);
        var shownAction = false, stickyAmount = null;
        var h = "<div class='kv'><span>" + t("eu_distance") + "</span><b>" + fmt(res.km, 0) + " km</b></div>";
        if (!res.regimes.length) {
          h += "<div class='big no'><span>" + t("eu_result") + "</span><strong>" + t("eu_not_covered") + "</strong></div><p class='small'>" + t("eu_not_covered_explain") + "</p>";
          out.innerHTML = h; return;
        }
        res.regimes.forEach(function (reg) {
          var e = res.results[reg];
          h += "<div class='big " + (e.eligible ? "" : "no") + "'><span>" + t("eu_result_regime", { regime: reg === "EU261" ? t("eu_regime_eu") : t("eu_regime_uk") }) + "</span><strong>" +
            (e.eligible ? money(e.amount, e.cur) + " " + t("eu_per_passenger") : t("eu_no_compensation")) + "</strong></div>";
          if (e.eligible && CP.claimUrl && !shownAction) {
            shownAction = true; stickyAmount = money(e.amount, e.cur) + " " + t("eu_per_passenger");
            h += "<div class='action'><b>" + t("eu_claim_title") + "</b><a class='cta' href='" + esc(CP.claimUrl) + "' rel='sponsored nofollow noopener' target='_blank'>" + t("eu_claim_cta") + " →</a><p class='small'>" + t("eu_claim_note") + "</p></div>";
          }
          h += "<ul class='why'>" + e.why.map(function (k) { return "<li>" + t("eu_why_" + k) + "</li>"; }).join("") + "</ul>";
          if (e.reduction) h += "<p class='small'>" + t("eu_" + e.reduction, { min: money(e.amount / 2, e.cur) }) + "</p>";
        });
        if (res.regimes.length === 2) h += "<p class='small'>" + t("eu_both") + "</p>";
        h += "<p class='small'>" + t("eu_care_note") + "</p>";
        out.innerHTML = h;
        EU261.sticky(stickyAmount);
      });
    }
  };

  // ------------------------------------------------------------ French salary, gross to net (2026)
  // Same rules as the salaryfr engine of the CalcPronto AI tools. Integer cents, half-up rounding per line.
  var Salary = {
    PMSS: 400500, // cents
    // rates in thousandths of a percent (6.90 % -> 6900)
    R: { vieillesse_plafonnee: 6900, vieillesse_deplafonnee: 400, agirc_arrco_t1: 3150, agirc_arrco_t2: 8640,
         ceg_t1: 860, ceg_t2: 1080, cet: 140, apec: 24, alsace_moselle_maladie: 1300,
         csg_deductible: 6800, csg_non_deductible: 2400, crds: 500, death: 1500 },
    GRID: [[0, 0], [163500, 500], [169800, 1300], [180700, 2100], [192800, 2900], [206000, 3500], [217000, 4100],
           [231500, 5300], [273800, 7500], [313500, 9900], [357100, 11900], [401900, 13800], [469000, 15800],
           [562400, 17900], [703700, 20000], [878900, 24000], [1220000, 28000], [1652300, 33000], [2593700, 38000],
           [5555800, 43000]],
    div: function (n, d) { return Math.floor((2 * n + d) / (2 * d)); }, // half-up for n >= 0
    pct: function (base, r) { return Salary.div(base * r, 100000); },
    neutral: function (taxable) {
      var r = 0;
      for (var i = 0; i < Salary.GRID.length; i++) { if (taxable >= Salary.GRID[i][0]) r = Salary.GRID[i][1]; else break; }
      return r;
    },
    compute: function (gross, cadre, am, ratioBp, pasMilli) {
      var R = Salary.R, ceil = Salary.div(Salary.PMSS * ratioBp, 10000);
      var t1 = Math.min(gross, ceil), t2 = Math.max(0, Math.min(gross, 8 * ceil) - ceil), lines = [];
      function add(code, base, r, ded) { lines.push({ code: code, base: base, rate: r, amount: Salary.pct(base, r), ded: ded }); }
      add("vieillesse_plafonnee", t1, R.vieillesse_plafonnee, true);
      add("vieillesse_deplafonnee", gross, R.vieillesse_deplafonnee, true);
      add("agirc_arrco_t1", t1, R.agirc_arrco_t1, true);
      add("ceg_t1", t1, R.ceg_t1, true);
      if (t2 > 0) { add("agirc_arrco_t2", t2, R.agirc_arrco_t2, true); add("ceg_t2", t2, R.ceg_t2, true); add("cet", t1 + t2, R.cet, true); }
      if (cadre) add("apec", Math.min(gross, 4 * ceil), R.apec, true);
      if (am) add("alsace_moselle_maladie", gross, R.alsace_moselle_maladie, true);
      var cap = 4 * ceil, death = cadre ? Salary.pct(t1, R.death) : 0;
      var csgBase = Salary.div(Math.min(gross, cap) * 9825, 10000) + Math.max(0, gross - cap) + death;
      add("csg_deductible", csgBase, R.csg_deductible, true);
      add("csg_non_deductible", csgBase, R.csg_non_deductible, false);
      add("crds", csgBase, R.crds, false);
      var social = 0, ded = 0;
      lines.forEach(function (l) { social += l.amount; if (l.ded) ded += l.amount; });
      var netBefore = gross - social, taxable = gross - ded;
      var kind = pasMilli === null ? "neutral" : "personal";
      var rate = pasMilli === null ? Salary.neutral(taxable) : pasMilli;
      var withheld = taxable > 0 ? Salary.pct(taxable, rate) : 0;
      return { gross: gross, lines: lines, social: social, netBefore: netBefore, taxable: taxable, rate: rate,
               kind: kind, withheld: withheld, netPaid: netBefore - withheld, csgBase: csgBase, ceiling: ceil };
    },
    grossFor: function (target, after, cadre, am, ratioBp, pasMilli) {
      function net(g) { var r = Salary.compute(g, cadre, am, ratioBp, pasMilli); return after ? r.netPaid : r.netBefore; }
      var lo = target, hi = target * 3 + 10000;
      if (net(hi) < target) return null;
      while (hi - lo > 1) { var mid = Math.floor((lo + hi) / 2); if (net(mid) < target) lo = mid; else hi = mid; }
      var g = hi;
      while (net(g) < target) g += 1;
      var best = g; // rounding per line: keep the lowest gross within 20 cents
      for (var k = 1; k <= 20; k++) { if (g - k > 0 && net(g - k) >= target) best = g - k; }
      return best;
    },
    toggle: function () {
      var n2g = $("#sal-dir").value === "n2g";
      $("#sal-nt-box").hidden = !n2g;
      $("#sal-amount-label").textContent = n2g ? t("sal_amount_net") : t("sal_amount_gross");
    },
    render: function () {
      var out = $("#result"), amount = val("sal-amount");
      if (!isFinite(amount) || amount <= 0) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
      var annual = $("#sal-period").value === "annual", cadre = $("#sal-status").value === "cadre", am = $("#sal-am").checked;
      var timePct = val("sal-time"); if (!isFinite(timePct) || timePct <= 0 || timePct > 100) timePct = 100;
      var pasRaw = $("#sal-pas").value.trim(), pas = pasRaw === "" ? null : num(pasRaw);
      if (pas !== null && (!isFinite(pas) || pas < 0 || pas > 43)) pas = null;
      var ratioBp = Math.round(timePct * 100), pasMilli = pas === null ? null : Math.round(pas * 1000);
      var cents = Math.round(amount * 100), monthly = annual ? Salary.div(cents, 12) : cents;
      var n2g = $("#sal-dir").value === "n2g", gross = monthly;
      if (n2g) {
        gross = Salary.grossFor(monthly, $("#sal-nt").value === "after", cadre, am, ratioBp, pasMilli);
        if (gross === null) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
      }
      var r = Salary.compute(gross, cadre, am, ratioBp, pasMilli), e = function (c) { return money(c / 100, "EUR"); };
      var h = "";
      if (n2g) h += "<div class='big'><span>" + t("sal_gross_needed") + " (" + t("sal_per_month") + ")</span><strong>" + e(gross) + "</strong></div>";
      else h += "<div class='kv'><span>" + t("sal_gross") + "</span><b>" + e(gross) + "</b></div>";
      h += "<div class='kv'><span>" + t("sal_contrib") + "</span><b>− " + e(r.social) + "</b></div>";
      h += (n2g ? "<div class='kv'><span>" : "<div class='big'><span>") + t("sal_net_before") + (n2g ? "</span><b>" + e(r.netBefore) + "</b></div>" : "</span><strong>" + e(r.netBefore) + "</strong></div>");
      h += "<div class='kv'><span>" + t("sal_net_taxable") + "</span><b>" + e(r.taxable) + "</b></div>";
      h += "<div class='kv'><span>" + t("sal_withheld", { rate: fmt(r.rate / 1000, r.rate % 1000 ? (r.rate % 100 ? 2 : 1) : 0), kind: t(r.kind === "neutral" ? "sal_kind_neutral" : "sal_kind_personal") }) + "</span><b>− " + e(r.withheld) + "</b></div>";
      h += "<div class='kv'><span><b>" + t("sal_net_paid") + "</b></span><b>" + e(r.netPaid) + "</b></div>";
      h += chart([{ l: t("ch_net"), v: r.netPaid }, { l: t("ch_contrib"), v: r.social }, { l: t("ch_tax"), v: r.withheld }]);
      h += "<p class='small'>" + t("sal_per_year") + (CP.lang === "fr" ? " : " : ": ") + t("sal_gross") + " " + e(gross * 12) + " · " + t("sal_net_before") + " " + e(r.netBefore * 12) + " · " + t("sal_net_paid") + " " + e(r.netPaid * 12) + "</p>";
      h += "<h3>" + t("sal_table") + "</h3><div class='table-wrap'><table class='data'><thead><tr><th>" + t("sal_col_line") + "</th><th>" + t("sal_col_base") + "</th><th>" + t("sal_col_rate") + "</th><th>" + t("sal_col_amount") + "</th></tr></thead><tbody>";
      r.lines.forEach(function (l) {
        h += "<tr><td>" + esc(t("sal_l_" + l.code)) + "</td><td>" + e(l.base) + "</td><td>" + fmt(l.rate / 1000, l.rate % 10 ? 3 : 2) + " %</td><td>" + e(l.amount) + "</td></tr>";
      });
      h += "<tr><th>" + t("sal_total") + "</th><td></td><td></td><th>" + e(r.social) + "</th></tr></tbody></table></div>";
      h += "<p class='small'>" + t("sal_rate_total", { rate: fmt(r.social / gross * 100, 2) }) + " " + t("sal_note") + "</p>";
      out.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ French income tax 2026 (on 2025 income)
  // Same rules as the incometaxfr engine of the CalcPronto AI tools. Exact integer arithmetic: incomes in euros,
  // caps in cents, scale tax in 1/10000 €, parts in quarters. Rounding half up to the euro at the same steps.
  var IncomeTax = {
    B: [[0, 0], [11600, 11], [29579, 30], [84577, 41], [181917, 45]], // one-part scale: lower bound (€), rate %
    CAP: 180700, CAP_T1: 426200, CAP_L: 107900, COMP: 180100,          // cents
    DEC: { single: 897, couple: 1483 }, DEC_RATE: 4525,                 // décote ceiling (€), 45.25 % in 1/100 %
    SAL: [509, 14555], PEN: [454, 4439],
    rhu: function (n, d) { return n >= 0 ? Math.floor((2 * n + d) / (2 * d)) : -Math.floor((-2 * n + d) / (2 * d)); },
    scale: function (inc, q4) { // tax in 1/10000 € for income inc (€) and q4 quarter parts
      var B = IncomeTax.B, incC = inc * 100, t = 0;
      for (var i = 0; i < B.length; i++) {
        var lo = B[i][0] * q4 * 25, top = i + 1 < B.length ? Math.min(incC, B[i + 1][0] * q4 * 25) : incC;
        if (top > lo) t += (top - lo) * B[i][1];
      }
      return t;
    },
    rows: function (inc, q4) {
      var B = IncomeTax.B, incC = inc * 100, out = [];
      for (var i = 0; i < B.length; i++) {
        var lo = B[i][0] * q4 * 25, top = i + 1 < B.length ? Math.min(incC, B[i + 1][0] * q4 * 25) : incC;
        var s = Math.max(0, top - lo);
        out.push({ from: B[i][0], to: i + 1 < B.length ? B[i + 1][0] : null, rate: B[i][1], income: s, tax: IncomeTax.rhu(s * B[i][1], 100) });
      }
      return out;
    },
    // o: {couple, children, shared, alone, disabled, veteran, caseL, dchildren, dshared}
    parts: function (o) {
      var c = [], rank = 0, k, CAP = IncomeTax.CAP, dep = o.children + o.shared;
      function add(code, q4, cap, comp) { c.push({ code: code, q4: q4, cap: cap, comp: comp || 0 }); }
      for (k = 0; k < o.children; k++) { rank++; var q = rank <= 2 ? 2 : 4; add("child", q, CAP / 2 * q); }
      for (k = 0; k < o.shared; k++) { rank++; var qs = rank <= 2 ? 1 : 2; add("shared_child", qs, CAP / 2 * qs); }
      if (!o.couple && o.alone && dep) {
        if (o.children) add("single_parent", 2, IncomeTax.CAP_T1 - CAP);
        else { var n = Math.min(o.shared, 2); add("single_parent", n, (IncomeTax.CAP_T1 - CAP) / 2 * n); }
      }
      for (k = 0; k < (o.dchildren || 0); k++) add("disabled_child", 2, CAP, IncomeTax.COMP);
      for (k = 0; k < (o.dshared || 0); k++) add("disabled_shared_child", 1, CAP / 2, IncomeTax.COMP / 2);
      if (!o.couple) {
        if (o.disabled || (o.veteran && !dep)) add(o.disabled ? "disability" : "veteran", 2, CAP, IncomeTax.COMP);
        else if (o.caseL && !dep) add("raised_children_alone", 2, IncomeTax.CAP_L);
      } else {
        for (k = 0; k < o.disabled; k++) add("disability", 2, CAP, IncomeTax.COMP);
        if (o.veteran && !o.disabled) add("veteran", 2, CAP, IncomeTax.COMP);
      }
      var base4 = o.couple ? 8 : 4, q4 = base4, cap = 0, comp = 0;
      c.forEach(function (x) { q4 += x.q4; cap += x.cap; comp += x.comp; });
      return { base4: base4, q4: q4, cap: cap, comp: comp, items: c };
    },
    deductions: function (sal, pen) {
      var sd = 0, pd = 0, S = IncomeTax.SAL, P = IncomeTax.PEN;
      sal.forEach(function (s) { var a = IncomeTax.rhu(s, 10); sd += Math.max(Math.min(a, S[1]), Math.min(S[0], s)); });
      pen.forEach(function (p) { pd += Math.max(IncomeTax.rhu(p, 10), Math.min(P[0], p)); });
      pd = Math.min(pd, P[1]);
      var tot = 0; sal.concat(pen).forEach(function (x) { tot += x; });
      return { salary: sd, pension: pd, income: Math.max(0, tot - sd - pd), base: tot };
    },
    compute: function (inc, o) {
      var p = IncomeTax.parts(o), rhu = IncomeTax.rhu;
      var all = rhu(IncomeTax.scale(inc, p.q4), 10000), base = null, gross = all, capped = false;
      if (p.q4 > p.base4) {
        base = rhu(IncomeTax.scale(inc, p.base4), 10000);
        var limit = rhu(base * 100 - p.cap - p.comp, 100);
        capped = limit > all; gross = Math.max(all, limit);
      }
      var dec = rhu(IncomeTax.DEC[o.couple ? "couple" : "single"] * 10000 - gross * IncomeTax.DEC_RATE, 10000);
      dec = Math.max(0, Math.min(dec, gross));
      var after = gross - dec, used4 = capped ? p.base4 : p.q4, marginal = 0;
      IncomeTax.B.forEach(function (b) { if (inc * 4 > b[0] * used4) marginal = b[1]; });
      return { income: inc, parts: p, all: all, base: base, capped: capped, gross: gross, decote: dec, after: after,
               due: after >= 61 ? after : 0, used4: used4, marginal: marginal };
    },
    pas: function (after, base) { return base > 0 ? IncomeTax.rhu(after * 1000, base) / 10 : null; },
    int: function (id) { var v = val(id); return isFinite(v) && v > 0 ? Math.min(20, Math.floor(v)) : 0; },
    euros: function (id) { var v = val(id); return isFinite(v) && v > 0 ? IncomeTax.rhu(Math.round(v * 100), 100) : 0; },
    opts: function () {
      var sit = $("#ir-situation").value, couple = sit === "couple";
      var o = { couple: couple, widowed: sit === "widowed", children: IncomeTax.int("ir-children"), shared: IncomeTax.int("ir-shared"),
                alone: $("#ir-alone").checked, disabled: Math.min(couple ? 2 : 1, +$("#ir-disabled").value || 0),
                veteran: $("#ir-veteran").checked, caseL: $("#ir-casel").checked, dchildren: 0, dshared: 0 };
      o.dchildren = Math.min(IncomeTax.int("ir-dchildren"), o.children);
      return o;
    },
    toggle: function () {
      var sal = $("#ir-mode").value === "salaries", sit = $("#ir-situation").value, couple = sit === "couple";
      var dep = IncomeTax.int("ir-children") + IncomeTax.int("ir-shared");
      $("#ir-taxable-box").hidden = sal; $("#ir-salaries-box").hidden = !sal; $("#ir-decl2-box").hidden = !couple;
      $("#ir-alone-box").hidden = couple || !dep; $("#ir-casel-box").hidden = couple || dep > 0;
      $("#ir-veteran-box").hidden = !couple && dep > 0;
      $("#ir-disabled-2").disabled = !couple; if (!couple && $("#ir-disabled").value === "2") $("#ir-disabled").value = "1";
    },
    render: function () {
      IncomeTax.toggle();
      var out = $("#result"), o = IncomeTax.opts(), sal = $("#ir-mode").value === "salaries", inc, base = null, d = null;
      if (o.widowed && (o.children || o.shared)) { out.innerHTML = "<p class='warn'>" + esc(t("ir_widow_kids")) + "</p>"; return; }
      if (sal) {
        var s = [IncomeTax.euros("ir-sal1")], p = [IncomeTax.euros("ir-pen1")];
        if (o.couple) { s.push(IncomeTax.euros("ir-sal2")); p.push(IncomeTax.euros("ir-pen2")); }
        s = s.filter(function (x) { return x > 0; }); p = p.filter(function (x) { return x > 0; });
        if (!s.length && !p.length) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
        d = IncomeTax.deductions(s, p); inc = d.income; base = d.base;
      } else {
        var raw = val("ir-income");
        if (!isFinite(raw) || raw < 0) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
        inc = IncomeTax.euros("ir-income");
      }
      if (o.veteran && !o.couple && (o.children || o.shared)) o.veteran = false;
      if (o.caseL && (o.couple || o.children || o.shared)) o.caseL = false;
      var r = IncomeTax.compute(inc, o), P = r.parts;
      var e0 = function (x) { return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(x); };
      var ec = function (c) { return money(c / 100, "EUR"); };
      var fp = function (q4) { return fmt(q4 / 4, q4 % 4 ? 2 : (q4 % 2 ? 1 : 0)).replace(/([.,]\d)0$/, "$1"); };
      var h = "<div class='big'><span>" + t("ir_tax") + "</span><strong>" + e0(r.due) + "</strong></div>";
      h += chart([{ l: t("ch_after"), v: inc - r.due }, { l: t("ch_tax"), v: r.due }]);
      if (d) h += "<div class='kv'><span>" + t("ir_deduction") + "</span><b>− " + e0(d.salary + d.pension) + "</b></div>";
      h += "<div class='kv'><span>" + t("ir_taxable") + "</span><b>" + e0(inc) + "</b></div>";
      h += "<div class='kv'><span>" + t("ir_parts") + "</span><b>" + fp(P.q4) + "</b></div>";
      h += "<div class='kv'><span>" + t("ir_quotient") + "</span><b>" + money(inc * 4 / P.q4, "EUR") + "</b></div>";
      h += "<div class='kv'><span>" + t("ir_tax_all") + "</span><b>" + e0(r.all) + "</b></div>";
      if (r.base !== null) h += "<div class='kv'><span>" + t("ir_tax_base", { parts: fp(P.base4), cap: ec(P.cap + P.comp) }) + "</span><b>" + e0(Math.max(0, IncomeTax.rhu(r.base * 100 - P.cap - P.comp, 100))) + "</b></div>";
      if (r.capped) h += "<p class='small'>" + t("ir_cap_applies") + "</p>";
      h += "<div class='kv'><span>" + t("ir_gross") + "</span><b>" + e0(r.gross) + "</b></div>";
      if (r.decote) h += "<div class='kv'><span>" + t("ir_decote") + "</span><b>− " + e0(r.decote) + "</b></div>";
      h += "<div class='kv'><span><b>" + t("ir_after") + "</b></span><b>" + e0(r.after) + "</b></div>";
      if (r.after > 0 && r.after < 61) h += "<p class='small'>" + t("ir_not_collected") + "</p>";
      h += "<div class='kv'><span>" + t("ir_avg") + "</span><b>" + fmt(inc > 0 ? r.after / inc * 100 : 0, 2) + " %</b></div>";
      h += "<div class='kv'><span>" + t("ir_marginal") + "</span><b>" + r.marginal + " %</b></div>";
      if (base) h += "<div class='kv'><span>" + t("ir_pas") + "</span><b>" + fmt(IncomeTax.pas(r.after, base), 1) + " %</b></div>";
      if (r.decote && r.marginal) h += "<p class='small'>" + t("ir_decote_marginal", { rate: fmt(r.marginal * 1.4525, 2) }) + "</p>";
      h += "<h3>" + t("ir_table", { parts: fp(r.used4) }) + "</h3><div class='table-wrap'><table class='data'><thead><tr><th>" + t("ir_col_bracket") + "</th><th>" + t("ir_col_rate") + "</th><th>" + t("ir_col_income") + "</th><th>" + t("ir_col_tax") + "</th></tr></thead><tbody>";
      IncomeTax.rows(inc, r.used4).forEach(function (b) {
        var label = b.to === null ? t("ir_above", { x: e0(b.from) }) : (b.from === 0 ? t("ir_upto", { x: e0(b.to) }) : e0(b.from) + " – " + e0(b.to));
        h += "<tr><td>" + label + "</td><td>" + b.rate + "\u00a0%</td><td>" + ec(b.income) + "</td><td>" + ec(b.tax) + "</td></tr>";
      });
      h += "</tbody></table></div><p class='small'>" + t("ir_note") + "</p>";
      out.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ French notary fees 2026 (frais de notaire)
  // Same rules as the notaryfeesfr engine of the CalcPronto AI tools. Exact integer arithmetic: amounts in cents,
  // rates in 1/1000 % (5.00 % -> 5000), each line rounded half up to the cent.
  var Notary = {
    SCALE: [[0, 3870], [650000, 1596], [1700000, 1064], [6000000, 799]], // lower bound (cents), rate (1/1000 %)
    COMMUNAL: 1200, FEE: 2370, NEW_RATE: 700, NEW_FEE: 2140, CSI: 100, CSI_MIN: 1500, VAT: 20000,
    AM: { "57": 1, "67": 1, "68": 1 }, MIN: 1000000, MAX: 10000000000,
    rhu: function (n, d) { return n >= 0 ? Math.floor((2 * n + d) / (2 * d)) : -Math.floor((-2 * n + d) / (2 * d)); },
    pct: function (c, r) { return Notary.rhu(c * r, 100000); },
    dept: function (code) {
      var L = CP.nfDepts || [];
      for (var i = 0; i < L.length; i++) if (L[i][0] === code) return { code: L[i][0], name: L[i][1], std: L[i][2], ftb: L[i][3] };
      return null;
    },
    brackets: function (P) {
      var S = Notary.SCALE, out = [];
      for (var i = 0; i < S.length; i++) {
        var lo = S[i][0], hi = i + 1 < S.length ? S[i + 1][0] : null, top = hi === null ? P : Math.min(P, hi);
        var part = Math.max(0, top - lo);
        out.push({ from: lo, to: hi, rate: S[i][1], base: part, fee: Notary.pct(part, S[i][1]) });
      }
      return out;
    },
    // P: price in cents; share: % of the price bought by first-time buyers (0, 50, 100); extra: cents
    compute: function (P, code, kind, share, extra) {
      var d = Notary.dept(code), r = { price: P, dept: d, kind: kind, share: share };
      if (kind === "new") {
        r.rate = Notary.NEW_RATE; r.deptTax = Notary.pct(P, Notary.NEW_RATE); r.communal = 0; r.feeRate = Notary.NEW_FEE;
      } else {
        var mix = share * d.ftb + (100 - share) * d.std;            // rate x 100, in 1/1000 %
        r.rate = mix / 100; r.deptTax = Notary.rhu(P * mix, 100 * 100000);
        r.communal = Notary.pct(P, Notary.COMMUNAL); r.feeRate = Notary.FEE;
      }
      r.collection = Notary.pct(r.deptTax, r.feeRate);
      r.transfer = r.deptTax + r.communal + r.collection;
      r.rows = Notary.brackets(P);
      r.feeHT = 0; r.rows.forEach(function (b) { r.feeHT += b.fee; });
      r.vat = Notary.pct(r.feeHT, Notary.VAT); r.feeTTC = r.feeHT + r.vat;
      r.csi = Notary.AM[code] ? 0 : Math.max(Notary.pct(P, Notary.CSI), Notary.CSI_MIN);
      r.extra = extra || 0;
      r.total = r.transfer + r.feeTTC + r.csi + r.extra;
      r.pct = Notary.rhu(r.total * 10000, P) / 100;                  // % of the price, 2 decimals, half up
      if (kind !== "new" && share === 0 && d.ftb < d.std) {
        var alt = Notary.pct(P, d.ftb);
        r.saving = r.deptTax + r.collection - (alt + Notary.pct(alt, Notary.FEE));
      }
      return r;
    },
    render: function () {
      var out = $("#result"), kind = $("#nf-type").value, code = $("#nf-dept").value;
      $("#nf-ftb-box").hidden = kind === "new";
      var v = val("nf-price");
      if (!isFinite(v) || v <= 0) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
      var P = Math.round(v * 100);
      if (P < Notary.MIN || P > Notary.MAX) { out.innerHTML = "<p class='hint'>" + esc(t("nf_min")) + "</p>"; return; }
      var ex = val("nf-extra"), extra = isFinite(ex) && ex > 0 ? Math.round(ex * 100) : 0;
      var share = kind === "new" ? 0 : (+$("#nf-ftb").value || 0);
      var r = Notary.compute(P, code, kind, share, extra);
      var ec = function (c) { return money(c / 100, "EUR"); };
      var rp = function (milli) { return fmt(milli / 1000, 2).replace(/[.,]00$/, "").replace(/([.,]\d)0$/, "$1"); };
      var h = "<div class='big'><span>" + t("nf_total") + "</span><strong>" + ec(r.total) + "</strong></div>";
      h += "<p class='small'>" + t("nf_pct", { pct: fmt(r.pct, 2) }) + "</p>";
      h += chart([{ l: t(kind === "new" ? "nf_tpf" : "nf_dmto"), v: r.transfer }, { l: t("ch_notary"), v: r.feeTTC }, { l: t("ch_other"), v: r.csi + r.extra }]);
      h += "<h3>" + (kind === "new" ? t("nf_tpf") : t("nf_dmto")) + "</h3>";
      h += "<div class='kv'><span>" + (kind === "new" ? t("nf_tpf_tax") : t("nf_dept_tax", { rate: rp(r.rate) })) + "</span><b>" + ec(r.deptTax) + "</b></div>";
      if (kind !== "new") h += "<div class='kv'><span>" + t("nf_comm_tax") + "</span><b>" + ec(r.communal) + "</b></div>";
      h += "<div class='kv'><span>" + t("nf_fee", { rate: fmt(r.feeRate / 1000, 2) }) + "</span><b>" + ec(r.collection) + "</b></div>";
      h += "<div class='kv total'><span><b>" + (kind === "new" ? t("nf_tpf") : t("nf_dmto")) + "</b></span><b>" + ec(r.transfer) + "</b></div>";
      h += "<h3>" + t("nf_notary_total") + "</h3>";
      h += "<div class='kv'><span>" + t("nf_emol") + "</span><b>" + ec(r.feeHT) + "</b></div>";
      h += "<div class='kv'><span>" + t("nf_vat") + "</span><b>" + ec(r.vat) + "</b></div>";
      h += "<div class='kv'><span>" + t("nf_csi") + "</span><b>" + (Notary.AM[code] ? esc(t("nf_csi_none")) : ec(r.csi)) + "</b></div>";
      if (r.extra) h += "<div class='kv'><span>" + t("nf_extra_line") + "</span><b>" + ec(r.extra) + "</b></div>";
      h += "<div class='kv total'><span><b>" + t("nf_cost") + "</b></span><b>" + ec(P + r.total) + "</b></div>";
      if (r.saving) h += "<p class='small'>" + t("nf_saving", { x: ec(r.saving) }) + "</p>";
      var notes = [];
      if (kind === "new") notes.push(t("nf_note_new"));
      else {
        if (code === "14") notes.push(t("nf_note_14"));
        if (code === "65") notes.push(t("nf_note_65"));
        if (code === "73") notes.push(t("nf_note_73"));
      }
      if (Notary.AM[code]) notes.push(t("nf_note_am"));
      notes.forEach(function (n) { h += "<p class='small'>" + esc(n) + "</p>"; });
      var e0 = function (c) { return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100); };
      h += "<h3>" + t("nf_table") + "</h3><div class='table-wrap'><table class='data'><thead><tr><th>" + t("nf_col_bracket") + "</th><th>" + t("nf_col_rate") + "</th><th>" + t("nf_col_base") + "</th><th>" + t("nf_col_fee") + "</th></tr></thead><tbody>";
      r.rows.forEach(function (b) {
        var label = b.to === null ? t("nf_above", { x: e0(b.from) }) : (b.from === 0 ? t("nf_upto", { x: e0(b.to) }) : e0(b.from) + " – " + e0(b.to));
        h += "<tr><td>" + label + "</td><td>" + fmt(b.rate / 1000, 3) + " %</td><td>" + ec(b.base) + "</td><td>" + ec(b.fee) + "</td></tr>";
      });
      h += "</tbody></table></div><p class='small'>" + t("nf_note") + "</p>";
      out.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ French micro-entrepreneur 2026
  // Same rules as the microfr engine of the CalcPronto AI tools. Exact integer arithmetic: amounts in cents, rates
  // in thousandths of a percent (12.3 % -> 12300), each line rounded half up to the cent.
  var Micro = {
    SOCIAL: { sales: 12300, services: 21200, liberal: 25600, liberal_cipav: 23200 },
    FLOOR: { liberal_cipav: 13400 },                                       // ACRE minimum rate (Urssaf table)
    CFP: { commercant: 100, artisan: 300, liberal: 200 },
    CH: { commercant_sales: { mainland: 15, alsace: 15, moselle: 15 }, commercant_services: { mainland: 44, alsace: 44, moselle: 44 },
          artisan_sales: { mainland: 220, alsace: 290, moselle: 370 }, artisan_services: { mainland: 480, alsace: 650, moselle: 830 } },
    VL: { sales: 1000, services: 1700, liberal: 2200, liberal_cipav: 2200 },
    AB: { sales: 71, services: 50, liberal: 34, liberal_cipav: 34 }, AB_MIN: 30500,
    PASS: 4806000,                                                          // 48 060 € in cents
    CEIL: { sales: 203100, services: 83600, liberal: 83600, liberal_cipav: 83600 },
    VAT: { sales: [85000, 93500], services: [37500, 41250], liberal: [37500, 41250], liberal_cipav: [37500, 41250] },
    MAX: 100000000,
    pct: function (c, r) { return Math.floor((2 * c * r + 100000) / 200000); },
    acreRate: function (act, frac) {
      var r = Math.ceil(Micro.SOCIAL[act] * frac / 10000) * 100;
      return Math.max(r, Micro.FLOOR[act] || 0);
    },
    acreCeil: function (act) { return Math.floor(Micro.PASS * 100 / (100 - Micro.AB[act])); },
    lines: function (ca, months, act, trade, acre, flat, chamber, zone) {
      var full = Micro.SOCIAL[act], social, base = 0;
      if (acre) {
        base = Math.min(ca, Math.floor(Micro.acreCeil(act) * months / 12));
        social = Micro.pct(base, acre) + Micro.pct(ca - base, full);
      } else social = Micro.pct(ca, full);
      var cfp = Micro.pct(ca, Micro.CFP[trade]);
      var chRate = chamber && trade !== "liberal" ? Micro.CH[trade + "_" + act][zone] : 0;
      var ch = Micro.pct(ca, chRate), total = social + cfp + ch, vl = flat ? Micro.pct(ca, Micro.VL[act]) : 0;
      return { turnover: ca, social: social, acreBase: base, cfp: cfp, chamber: ch, chamberRate: chRate, total: total,
               net: ca - total, flat: vl, netAfter: ca - total - vl };
    },
    // ca in cents over `months` (1, 3 or 12); acreFrac 0 (none), 50 (started up to 30 June 2026) or 75 (from 1 July 2026)
    compute: function (ca, months, act, trade, acreFrac, flat, chamber, zone) {
      if (act === "liberal" || act === "liberal_cipav") trade = "liberal";
      var acre = acreFrac ? Micro.acreRate(act, acreFrac) : 0;
      var p = Micro.lines(ca, months, act, trade, acre, flat, chamber, zone);
      var annualCa = Math.floor(ca * 12 / months), y = Micro.lines(annualCa, 12, act, trade, acre, flat, chamber, zone);
      var abat = Math.min(annualCa, Math.max(Micro.pct(annualCa, Micro.AB[act] * 1000), Micro.AB_MIN));
      return { act: act, trade: trade, months: months, acre: acre, full: Micro.SOCIAL[act], period: p, annual: y,
               abatement: abat, taxable: annualCa - abat, acreCeiling: Micro.acreCeil(act),
               aboveCeiling: annualCa > Micro.CEIL[act] * 100, aboveVat: annualCa > Micro.VAT[act][0] * 100,
               aboveVatHigh: annualCa > Micro.VAT[act][1] * 100 };
    },
    toggle: function () {
      var act = $("#me-activity").value, lib = act === "liberal" || act === "liberal_cipav";
      $("#me-trade-box").hidden = lib;
      $("#me-chamber-box").hidden = lib;
      $("#me-zone-box").hidden = lib || $("#me-trade").value !== "artisan";
    },
    render: function () {
      Micro.toggle();
      var out = $("#result"), v = val("me-amount");
      if (!isFinite(v) || v <= 0) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
      var ca = Math.round(v * 100);
      if (ca > Micro.MAX) { out.innerHTML = "<p class='hint'>" + esc(t("me_max")) + "</p>"; return; }
      var act = $("#me-activity").value, months = +$("#me-period").value, flat = $("#me-flat").checked;
      var r = Micro.compute(ca, months, act, $("#me-trade").value, +$("#me-acre").value, flat, $("#me-chamber").checked, $("#me-zone").value);
      var e = function (c) { return money(c / 100, "EUR"); };
      var e0 = function (n) { return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n); };
      var rp = function (m) { return fmt(m / 1000, m % 10 ? 3 : (m % 100 ? 2 : (m % 1000 ? 1 : 0))); };
      var p = r.period, h = "";
      h += "<div class='big'><span>" + t(flat ? "me_net_vl" : "me_net") + "</span><strong>" + e(flat ? p.netAfter : p.net) + "</strong></div>";
      h += chart([{ l: t(flat ? "me_net_vl" : "me_net"), v: flat ? p.netAfter : p.net }, { l: t("ch_contrib"), v: p.total }, { l: t("ch_tax"), v: flat ? p.flat : 0 }]);
      h += "<div class='kv'><span>" + t("me_turnover") + "</span><b>" + e(p.turnover) + "</b></div>";
      if (r.acre) {
        h += "<div class='kv'><span>" + t("me_social_acre", { rate: rp(r.acre) }) + "</span><b>− " + e(Micro.pct(p.acreBase, r.acre)) + "</b></div>";
        if (p.turnover > p.acreBase) h += "<div class='kv'><span>" + t("me_social_full", { rate: rp(r.full) }) + "</span><b>− " + e(p.social - Micro.pct(p.acreBase, r.acre)) + "</b></div>";
      } else h += "<div class='kv'><span>" + t("me_social", { rate: rp(r.full) }) + "</span><b>− " + e(p.social) + "</b></div>";
      h += "<div class='kv'><span>" + t("me_cfp", { rate: rp(Micro.CFP[r.trade]) }) + "</span><b>− " + e(p.cfp) + "</b></div>";
      if (p.chamberRate) h += "<div class='kv'><span>" + t("me_chamber_line", { rate: rp(p.chamberRate) }) + "</span><b>− " + e(p.chamber) + "</b></div>";
      h += "<div class='kv total'><span><b>" + t("me_total") + "</b></span><b>" + e(p.total) + "</b></div>";
      h += "<p class='small'>" + t("me_pct", { pct: fmt(p.total / p.turnover * 100, 2) }) + "</p>";
      if (flat) {
        h += "<div class='kv'><span>" + t("me_net_before") + "</span><b>" + e(p.net) + "</b></div>";
        h += "<div class='kv'><span>" + t("me_flat_line", { rate: rp(Micro.VL[act]) }) + "</span><b>− " + e(p.flat) + "</b></div>";
      }
      if (months !== 12) {
        h += "<h3>" + t("me_annual") + "</h3><p class='small'>" + t("me_annual_line", { ca: e(r.annual.turnover), c: e(r.annual.total), n: e(flat ? r.annual.netAfter : r.annual.net) }) + "</p>";
      }
      var notes = [];
      if (!flat) notes.push(t("me_taxable", { x: e(r.taxable), ab: String(Micro.AB[act]) }));
      else notes.push(t("me_note_vl"));
      if (r.acre) notes.push(t("me_note_acre", { x: e(r.acreCeiling) }));
      if (r.aboveCeiling) notes.push(t("me_ceiling", { x: e0(Micro.CEIL[act]) }));
      if (r.aboveVatHigh) notes.push(t("me_vat_high", { y: e0(Micro.VAT[act][1]) }));
      else if (r.aboveVat) notes.push(t("me_vat", { x: e0(Micro.VAT[act][0]), y: e0(Micro.VAT[act][1]) }));
      notes.push(t("me_note_expenses"));
      notes.forEach(function (n) { h += "<p class='small'>" + esc(n) + "</p>"; });
      h += tips({ ca10k: r.annual.turnover > 1000000 });
      out.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ French zero-interest home loan (same rules as the ptzfr engine)
  var Ptz = {
    CEIL: { A: [49000, 73500, 88200, 102900, 117600, 132300, 147000, 161700], B1: [34500, 51750, 62100, 72450, 82800, 93150, 103500, 113850],
            B2: [31500, 47250, 56700, 66150, 75600, 85050, 94500, 103950], C: [28500, 42750, 51300, 59850, 68400, 76950, 85500, 94050] },
    COEF10: [10, 15, 18, 21, 24, 27, 30, 33],                               // family coefficient x 10, 1 to 8+ persons
    LIMIT: { A: [25000, 31000, 37000, 49000], B1: [21500, 26000, 30000, 34500], B2: [18000, 22500, 27000, 31500], C: [15000, 19500, 24000, 28500] },
    COST: { A: [150000, 225000, 270000, 315000, 360000], B1: [135000, 202500, 243000, 283500, 324000],
            B2: [110000, 165000, 198000, 231000, 264000], C: [100000, 150000, 180000, 210000, 240000] },
    Q: { new_collective: [50, 40, 40, 20], new_individual: [30, 20, 20, 10], new_assisted: [50, 40, 40, 20],
         old_with_works: [50, 40, 40, 20], social_sale: [20, 20, 20, 20] },
    DUR: [[10, 15], [8, 12], [2, 13], [0, 10]],                              // [deferral, repayment] years by tranche
    MAX: 1000000000,                                                          // 10 000 000 € in cents
    halfUp: function (num, den) { return Math.floor((2 * num + den) / (2 * den)); },
    // Amounts in cents; zone "A" (also A bis), "B1", "B2" or "C"; works in cents or null when not given.
    compute: function (zone, persons, rfr, cost, op, works) {
      var i8 = Math.min(persons, 8) - 1, c = Ptz.COEF10[i8];
      var scaled = Math.max(rfr * 9, cost), tranche = null;                   // resources x 9, exact
      for (var k = 0; k < 4; k++) if (scaled * 10 <= Ptz.LIMIT[zone][k] * 100 * 9 * c) { tranche = k + 1; break; }
      var ceiling = Ptz.CEIL[zone][i8], cap = Ptz.COST[zone][Math.min(persons, 5) - 1];
      var costTaken = Math.min(cost, cap * 100), reasons = [];
      if (scaled > ceiling * 100 * 9) reasons.push("ceiling");
      if (op === "old_with_works" && zone !== "B2" && zone !== "C") reasons.push("zone");
      if (op === "old_with_works" && works !== null && works * 100 < cost * 25) reasons.push("works");
      var r = { tranche: tranche, ceiling: ceiling, cap: cap, coef: c, retained: Ptz.halfUp(scaled, 9),
                perCoef: Ptz.halfUp(scaled * 10, 9 * c), floorApplies: cost > rfr * 9, costTaken: costTaken, reasons: reasons,
                eligible: !reasons.length && tranche !== null, amount: 0, quotite: null, deferral: null, years: null,
                months: null, monthly: null, last: null, others: null };
      if (r.eligible) {
        var q = Ptz.Q[op][tranche - 1], amount = Math.floor(costTaken * q / 100), d = Ptz.DUR[tranche - 1];
        r.quotite = q; r.amount = amount; r.deferral = d[0]; r.years = d[1]; r.months = d[1] * 12;
        r.monthly = Ptz.halfUp(amount, r.months); r.last = amount - r.monthly * (r.months - 1);
        r.others = q === 50 ? Math.ceil(amount * 100 / 125) : amount;
      }
      return r;
    },
    render: function () {
      var op = $("#pz-type").value;
      $("#pz-works-box").hidden = op !== "old_with_works";
      var out = $("#result"), rfr = val("pz-rfr"), cost = val("pz-cost"), w = val("pz-works");
      if (!isFinite(rfr) || rfr < 0 || !isFinite(cost) || cost <= 0) { out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return; }
      var rc = Math.round(cost * 100), works = (op === "old_with_works" && isFinite(w) && w > 0) ? Math.round(w * 100) : null;
      if (Math.round(rfr * 100) > Ptz.MAX || rc > Ptz.MAX) { out.innerHTML = "<p class='hint'>" + esc(t("pz_max")) + "</p>"; return; }
      if (works !== null && works > rc) { out.innerHTML = "<p class='hint'>" + esc(t("pz_works_max")) + "</p>"; return; }
      var zv = $("#pz-zone").value, zone = zv === "Abis" ? "A" : zv;
      var r = Ptz.compute(zone, +$("#pz-persons").value, Math.round(rfr * 100), rc, op, works);
      var e = function (c) { return money(c / 100, "EUR"); };
      var e0 = function (n) { return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n); };
      var pc = function (x) { return fmt(x, 0) + (CP.lang === "en" ? "%" : " %"); };
      var kv = function (k, v) { return "<div class='kv'><span>" + k + "</span><b>" + v + "</b></div>"; };
      var h = "", notes = [];
      if (!r.eligible) {
        h += "<div class='big'><span>" + t("pz_amount") + "</span><strong>" + t("pz_none") + "</strong></div>";
        r.reasons.forEach(function (x) {
          var s = x === "ceiling" ? t("pz_reason_ceiling", { x: e(r.retained), y: e0(r.ceiling) })
            : x === "zone" ? t("pz_reason_zone") : t("pz_reason_works", { x: e(Math.ceil(rc * 25 / 100)) });
          h += "<p class='warn'>" + esc(s) + "</p>";
        });
        h += kv(t("pz_resources"), e(r.retained));
      } else {
        h += "<div class='big'><span>" + t("pz_amount") + "</span><strong>" + e(r.amount) + "</strong></div>";
        h += chart([{ l: t("pz_ch_ptz"), v: r.amount }, { l: t("pz_ch_rest"), v: rc - r.amount }]);   // financing of the whole cost
        h += kv(t("pz_resources"), e(r.retained));
        h += kv(t("pz_per_coef", { c: fmt(r.coef / 10, r.coef % 10 ? 1 : 0) }), e(r.perCoef));
        h += kv(t("pz_tranche"), t("pz_tranche_val", { t: String(r.tranche) }));
        h += kv(t("pz_cost_taken"), e(r.costTaken));
        h += kv(t("pz_quotite"), pc(r.quotite));
        h += kv(t("pz_duration"), r.deferral ? t("pz_duration_def", { n: String(r.deferral + r.years), d: String(r.deferral) }) : t("pz_duration_nodef", { n: String(r.years) }));
        h += "<div class='kv total'><span><b>" + t("pz_monthly") + "</b></span><b>" + t("pz_monthly_val", { m: e(r.monthly), k: String(r.months) }) + "</b></div>";
        notes.push(r.deferral ? t("pz_after_def", { d: String(r.deferral), k: String(r.months), m: e(r.monthly), l: e(r.last) })
                              : t("pz_no_def", { k: String(r.months), m: e(r.monthly), l: e(r.last) }));
        notes.push(t("pz_others", { x: e(r.others) }));
        if (r.costTaken < rc) notes.push(t("pz_note_cap", { x: e0(r.cap) }));
        if (op === "new_individual") notes.push(t("pz_note_house"));
      }
      if (r.floorApplies) notes.push(t("pz_note_floor", { x: e(r.retained) }));
      if (op === "old_with_works") notes.push(t("pz_note_old"));
      notes.push(t("pz_note_conditions"));
      notes.forEach(function (n) { h += "<p class='small'>" + esc(n) + "</p>"; });
      out.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ French severance pay 2026
  // Same rules as the severancefr engine of the CalcPronto AI tools. Exact integer arithmetic: amounts in cents,
  // rates in thousandths of a percent (9.2 % -> 9200), each line rounded half up to the cent, exempt halves down.
  var Severance = {
    PASS: 4806000,                          // 48 060 € in cents (plafond annuel de la Sécurité sociale 2026)
    CSG: 9200, CRDS: 500, EMP: 40, MIN_MONTHS: 8,
    MAX_SALARY: 100000000, MAX_AMOUNT: 2000000000,
    pct: function (c, r) { return Math.floor((2 * c * r + 100000) / 200000); },
    units: function (m) { return 3 * Math.min(m, 120) + 4 * Math.max(m - 120, 0); },     // 144ths of a month
    legal: function (s, m) { return Math.floor((2 * s * Severance.units(m) + 144) / 288); },
    // kind 'rupture_conventionnelle' or 'licenciement'; cents; s3, paid, conv, prev: null when not given
    compute: function (kind, s12, s3, months, paid, conv, prev, pension) {
      var S = Severance, P = S.PASS, salary = Math.max(s12, s3 || 0), eligible = months >= S.MIN_MONTHS;
      var legal = eligible ? S.legal(salary, months) : (kind === "licenciement" ? 0 : null);
      var minimum = legal === null && conv === null ? null : Math.max(legal || 0, conv || 0);
      if (paid === null) paid = minimum;
      if (paid === null) return null;                                   // rupture conventionnelle under 8 months
      var lc = Math.max(legal || 0, conv || 0), prevEst = prev === null;
      if (prevEst) prev = 12 * s12;
      var alt = Math.min(Math.max(2 * prev, Math.floor(paid / 2)), 6 * P);
      var taxEx = Math.min(paid, Math.max(lc, alt)), full = paid > 10 * P;
      var socEx = full ? 0 : Math.min(taxEx, 2 * P), csgEx = Math.min(lc, socEx);
      var rcPension = kind === "rupture_conventionnelle" && pension;
      if (rcPension) taxEx = 0;
      var base = paid - csgEx, csg = S.pct(base, S.CSG), crds = S.pct(base, S.CRDS);
      var empPct = kind === "rupture_conventionnelle" ? S.EMP : 0, emp = S.pct(socEx, empPct * 1000);
      return { kind: kind, salary: salary, method: s3 !== null && s3 > s12 ? "3" : "12", eligible: eligible, legal: legal,
               factor: S.units(months) / 144, minimum: minimum, paid: paid, below: minimum !== null && paid < minimum,
               legalConv: lc, prev: prev, prevEst: prevEst, alt: alt, taxExempt: taxEx, taxable: paid - taxEx,
               rcPension: rcPension, socExempt: socEx, subject: paid - socEx, full: full, csgExempt: csgEx, csgBase: base,
               csg: csg, crds: crds, net: paid - csg - crds, empPct: empPct, employer: emp, cost: paid + emp };
    },
    opt: function (id) {
      var el = document.getElementById(id);
      if (!el || String(el.value).trim() === "") return null;
      var v = num(el.value);
      return isFinite(v) && v >= 0 ? Math.round(v * 100) : NaN;
    },
    render: function () {
      var S = Severance, out = $("#result"), kind = $("#sv-type").value;
      $("#sv-pension-box").hidden = kind !== "rupture_conventionnelle";
      var s12 = val("sv-salary"), years = val("sv-years"), months = +$("#sv-months").value;
      var s3 = S.opt("sv-salary3"), paid = S.opt("sv-paid"), conv = S.opt("sv-conv"), prev = S.opt("sv-prev");
      if (!isFinite(s12) || s12 <= 0 || !isFinite(years) || years < 0 || years > 60 || years !== Math.floor(years) ||
          12 * years + months < 1 || [s3, paid, conv, prev].some(function (x) { return x !== null && isNaN(x); })) {
        out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return;
      }
      s12 = Math.round(s12 * 100);
      if (s12 > S.MAX_SALARY || (s3 || 0) > S.MAX_SALARY || [paid, conv, prev].some(function (x) { return x !== null && x > S.MAX_AMOUNT; })) {
        out.innerHTML = "<p class='hint'>" + esc(t("sv_max")) + "</p>"; return;
      }
      var total = 12 * years + months, pension = $("#sv-pension").checked;
      var r = S.compute(kind, s12, s3, total, paid, conv, prev, pension);
      if (!r) { out.innerHTML = "<p class='hint'>" + esc(t("sv_need_paid")) + "</p>"; return; }
      var e = function (c) { return money(c / 100, "EUR"); };
      var e0 = function (c) { return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100); };
      var unit = function (n, one, many) { return n + " " + t(n === 1 ? one : many); };
      var sen = [years ? unit(years, "sv_y1", "sv_yn") : "", months ? unit(months, "sv_m1", "sv_mn") : ""].filter(Boolean).join(" " + t("sv_and") + " ");
      var kv = function (k, v, cls) { return "<div class='kv" + (cls ? " " + cls : "") + "'><span>" + k + "</span><b>" + v + "</b></div>"; };
      var h = "";
      h += "<div class='big'><span>" + t("sv_min") + "</span><strong>" + (r.minimum === null ? t("sv_min_none") : e(r.minimum)) + "</strong></div>";
      if (r.eligible) h += "<p class='small'>" + esc(t("sv_months_of", { m: fmt(r.factor, r.factor * 100 % 1 ? 2 : (r.factor * 10 % 1 ? 2 : (r.factor % 1 ? 1 : 0))) })) + "</p>";
      // Split of what the employer pays: net for the employee, CSG-CRDS, employer contribution (rupture conventionnelle)
      h += chart([{ l: t("sv_ch_net"), v: r.net }, { l: "CSG-CRDS", v: r.csg + r.crds }, { l: t("sv_emp", { rate: String(r.empPct) }), v: r.employer }]);
      h += kv(t("sv_ref"), e(r.salary) + " (" + t(r.method === "3" ? "sv_ref_3" : "sv_ref_12") + ")");
      h += kv(t("sv_seniority"), esc(sen));
      if (conv !== null) { h += kv(t("sv_legal"), r.legal === null ? "—" : e(r.legal)); h += kv(t("sv_conv_line"), e(conv)); }
      h += kv(t("sv_paid_line"), e(r.paid));
      h += kv(t("sv_tax_ex"), e(r.taxExempt)) + kv(t("sv_taxable"), e(r.taxable));
      h += kv(t("sv_soc_ex"), e(r.socExempt)) + kv(t("sv_soc_sub"), e(r.subject));
      h += kv(t("sv_csg", { rate: fmt(9.2, 1) }), "− " + e(r.csg)) + kv(t("sv_crds", { rate: fmt(0.5, 1) }), "− " + e(r.crds));
      h += kv("<b>" + t("sv_net") + "</b>", e(r.net), "total");
      if (r.empPct) { h += kv(t("sv_emp", { rate: String(r.empPct) }), e(r.employer)) + kv(t("sv_cost"), e(r.cost)); }
      var notes = [];
      if (!r.eligible && kind === "licenciement") notes.push(t("sv_note_lt8"));
      if (r.below) notes.push(t(kind === "rupture_conventionnelle" ? "sv_note_below" : "sv_note_below_lic", { x: e(r.minimum) }));
      if (r.csgBase === 0 && r.subject === 0 && r.taxable === 0) notes.push(t("sv_note_min"));
      else if (r.csgBase > 0) notes.push(t("sv_note_supra", { x: e(r.csgBase) }));
      if (r.prevEst && r.paid > r.legalConv) notes.push(t("sv_note_prev", { x: e0(r.prev), y: e0(Math.max(r.legalConv, Math.min(2 * r.prev, 6 * S.PASS))) }));
      if (r.full) notes.push(t("sv_note_full"));
      else if (r.subject > 0) notes.push(t("sv_note_subject", { x: e(r.subject) }));
      if (r.rcPension) notes.push(t("sv_note_pension"));
      notes.push(t(kind === "rupture_conventionnelle" ? "sv_note_rc" : "sv_note_faute"));
      notes.push(t("sv_note_seniority"));
      notes.forEach(function (n) { h += "<p class='small'>" + esc(n) + "</p>"; });
      out.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ French unemployment benefit (ARE) 2026
  // Same rules as the arefr engine of the CalcPronto AI tools. Exact integer arithmetic: amounts in cents, rates in
  // thousandths of a percent (40,4 % -> 40400), each line rounded half up to the cent.
  var Unemployment = {
    FIXED: 1318, MIN: 3213, CEIL: 1602000, SMIC_FLOOR: 6200, DEG_FLOOR: 9257, DEG_DAY: 183,
    CSG: { normal: 6200, reduced: 3800, exempt: 0 }, CRDS: 500, BASE: 98250,
    MAX_SALARY: 100000000, MAX_M100: 60000,
    pct: function (c, r) { return Math.floor((2 * c * r + 100000) / 200000); },
    pct2: function (c, r1, r2) { return Math.floor((2 * c * r1 * r2 + 1e10) / 2e10); },
    sjr: function (m) { return Math.floor((2 * m * 12 + 365) / 730); },                  // monthly x 12 / 365
    days: function (m100) { return Math.floor((2 * m100 * 365 + 1200) / 2400); },       // months x 365 / 12
    monthsOf: function (d) { return Math.floor((2 * d * 120 + 365) / 730) / 10; },       // days x 12 / 365, 1 decimal
    gross: function (sjr) {
      var U = Unemployment, a1 = U.pct(sjr, 40400) + U.FIXED, a2 = U.pct(sjr, 57000), cap = U.pct(sjr, 75000);
      var best = Math.max(a1, a2, U.MIN), g, f;
      if (cap < best) { g = cap; f = "cap_75"; }
      else if (U.MIN > a1 && U.MIN > a2) { g = U.MIN; f = "minimum"; }
      else if (a2 >= a1) { g = a2; f = "57"; }
      else { g = a1; f = "40_4_fixed"; }
      return { a1: a1, a2: a2, cap: cap, gross: g, formula: f };
    },
    ded: function (g, sjr, rate) {
      var U = Unemployment, ret = Math.min(U.pct(sjr, 3000), Math.max(0, g - U.MIN)), after = g - ret;
      var csg = rate ? U.pct2(g, U.BASE, rate) : 0, crds = rate ? U.pct2(g, U.BASE, U.CRDS) : 0;
      var full = csg + crds, room = Math.max(0, after - U.SMIC_FLOOR), reduced = csg + crds > room;
      if (reduced) { crds = Math.min(crds, room); csg = room - crds; }
      return { ret: ret, retFull: U.pct(sjr, 3000), csg: csg, crds: crds, net: after - csg - crds, after: after,
               reduced: reduced && full > 0, full: full };
    },
    // salary in cents, months in hundredths of a month, age in years, rc and first booleans, csg 'normal' | 'reduced' | 'exempt'
    compute: function (salary, m100, age, rc, first, csg) {
      var U = Unemployment, senior = age >= 55, ref = senior ? 36 : 24, kept = Math.min(m100, 100 * ref);
      var retained = Math.min(salary, U.CEIL), sjr = U.sjr(retained), required = first ? 5 : 6;
      var eligible = kept >= 100 * required, gr = U.gross(sjr), rate = U.CSG[csg], d = U.ded(gr.gross, sjr, rate);
      var r = { salary: salary, retained: retained, capped: salary > U.CEIL, sjr: sjr, ref: ref, kept: kept, m100: m100,
                required: required, eligible: eligible, a1: gr.a1, a2: gr.a2, cap: gr.cap, gross: gr.gross,
                formula: gr.formula, ret: d.ret, retFull: d.retFull, csg: d.csg, crds: d.crds, net: d.net,
                after: d.after, reduced: d.reduced, csgFull: d.full, monthlyGross: 30 * gr.gross, monthlyNet: 30 * d.net };
      if (!eligible) return r;
      var counted = U.days(kept), raw = Math.floor((counted * 75 + 99) / 100);
      var min = kept >= 600 ? 182 : 152, max = age >= 57 ? 822 : (age >= 55 ? 685 : 548);
      var days = Math.min(Math.max(raw, min), max), limited = raw < min ? "minimum" : (raw > max ? "maximum" : null);
      var capRc = rc ? (senior ? 624 : 456) : null;
      if (capRc !== null && days > capRc) { days = capRc; limited = "rupture_conventionnelle"; }
      r.counted = counted; r.raw = raw; r.days = days; r.months = U.monthsOf(days); r.limited = limited;
      r.minDays = min; r.maxDays = max; r.capRc = capRc;
      r.deg = age < 55 && gr.gross > U.DEG_FLOOR;
      r.degReason = age >= 55 ? "age" : "threshold";
      if (r.deg) {
        var g2 = Math.max(U.pct(gr.gross, 70000), U.DEG_FLOOR), d2 = U.ded(g2, sjr, rate);
        var fullDays = Math.min(days, U.DEG_DAY - 1), redDays = days - fullDays;
        r.degGross = g2; r.degNet = d2.net; r.degRet = d2.ret; r.degCsg = d2.csg; r.degCrds = d2.crds;
        r.degMonthlyGross = 30 * g2; r.degMonthlyNet = 30 * d2.net; r.redDays = redDays;
        r.totalGross = fullDays * gr.gross + redDays * g2; r.totalNet = fullDays * d.net + redDays * d2.net;
      } else {
        r.redDays = 0; r.totalGross = days * gr.gross; r.totalNet = days * d.net;
      }
      return r;
    },
    render: function () {
      var U = Unemployment, out = $("#result");
      var salary = val("ue-salary"), months = val("ue-months"), age = val("ue-age");
      if (!isFinite(salary) || salary < 1 || !isFinite(months) || months < 0 || !isFinite(age) || age !== Math.floor(age)) {
        out.innerHTML = "<p class='hint'>" + t("fill_fields") + "</p>"; return;
      }
      var cents = Math.round(salary * 100), m100 = Math.round(months * 100);
      if (cents > U.MAX_SALARY || m100 > U.MAX_M100 || age < 16 || age > 75) { out.innerHTML = "<p class='hint'>" + esc(t("ue_max")) + "</p>"; return; }
      var rc = $("#ue-end").value === "rc", first = $("#ue-first").checked, csg = $("#ue-csg").value;
      var r = U.compute(cents, m100, age, rc, first, csg);
      var e = function (c) { return money(c / 100, "EUR"); };
      var kv = function (k, v, cls) { return "<div class='kv" + (cls ? " " + cls : "") + "'><span>" + k + "</span><b>" + v + "</b></div>"; };
      var notes = [], h = "";
      if (r.m100 > r.kept) notes.push(t("ue_note_ref", { p: r.ref }));
      if (!r.eligible) {
        h += "<p class='hint'>" + esc(t("ue_not_eligible", { n: r.required, p: r.ref })) + "</p>";
        if (!first && r.kept >= 500) h += "<p class='small'>" + esc(t("ue_not_eligible_first")) + "</p>";
        notes.forEach(function (n) { h += "<p class='small'>" + esc(n) + "</p>"; });
        out.innerHTML = h; return;
      }
      var fl = { "57": "ue_f_57", "40_4_fixed": "ue_f_404", minimum: "ue_f_min", cap_75: "ue_f_cap" }[r.formula];
      var pctTxt = function (x) { return fmt(x, 1); };
      h += "<div class='big'><span>" + t("ue_monthly_net") + "</span><strong>" + e(r.monthlyNet) + "</strong></div>";
      h += chart([{ l: t("ch_net"), v: r.monthlyNet }, { l: t("ch_contrib"), v: r.monthlyGross - r.monthlyNet }]);
      h += kv(t("ue_daily_gross") + " <small>(" + esc(t(fl)) + ")</small>", e(r.gross));
      h += kv(t("ue_sjr"), e(r.sjr));
      h += kv(t("ue_retirement"), "− " + e(r.ret));
      h += kv(t("ue_csg_line", { rate: pctTxt(U.CSG[csg] / 1000) }), "− " + e(r.csg));
      h += kv(t("ue_crds_line", { rate: pctTxt(U.CSG[csg] ? 0.5 : 0) }), "− " + e(r.crds));
      h += kv("<b>" + t("ue_daily_net") + "</b>", e(r.net), "total");
      h += kv(t("ue_monthly_gross"), e(r.monthlyGross));
      h += kv(t("ue_duration"), esc(t("ue_days_months", { d: r.days, m: fmt(r.months, r.months % 1 ? 1 : 0) })));
      if (r.deg) h += kv(t("ue_deg"), esc(t("ue_deg_value", { x: e(r.degMonthlyNet) })));
      h += kv(t("ue_total"), esc(t("ue_total_value", { g: e(r.totalGross), n: e(r.totalNet) })));
      if (r.capped) notes.push(t("ue_note_cap"));
      if (r.salary < 186702) notes.push(t("ue_note_parttime"));
      if (r.ret < r.retFull) notes.push(t("ue_note_ret_floor"));
      if (csg === "exempt") notes.push(t("ue_note_csg_exempt"));
      else if (r.csgFull > 0 && r.csg + r.crds === 0) notes.push(t("ue_note_no_csg"));
      else if (r.reduced) notes.push(t("ue_note_csg_floor"));
      if (r.limited === "rupture_conventionnelle") notes.push(t(age >= 55 ? "ue_note_rc55" : "ue_note_rc"));
      else if (r.limited === "maximum") notes.push(t("ue_note_max", { d: r.maxDays }));
      else if (r.limited === "minimum") notes.push(t("ue_note_min", { d: r.minDays }));
      if (r.deg) notes.push(t("ue_note_deg")); else if (age >= 55) notes.push(t("ue_note_deg55"));
      notes.push(t("ue_note_rule"));
      notes.push(t("ue_note_start"));
      notes.forEach(function (n) { h += "<p class='small'>" + esc(n) + "</p>"; });
      out.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ wiring
  function bind(ids, fn) {
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.addEventListener("input", fn); el.addEventListener("change", fn); }
    });
  }

  function init() {
    var page = CP.page;
    if (page === "loan") {
      if (CP.prefillLoan) { $("#loan-amount").value = CP.prefillLoan.amount; $("#loan-years").value = CP.prefillLoan.years; $("#loan-ins").value = CP.prefillLoan.ins; }
      bind(["loan-amount", "loan-rate", "loan-years", "loan-ins", "loan-fees", "currency"], Loan.render); Loan.render();
    }
    if (page === "capacity") {
      if (CP.prefillCapIncome) $("#cap-income").value = CP.prefillCapIncome;
      bind(["cap-income", "cap-debts", "cap-rate", "cap-years", "cap-ratio", "cap-ins", "cap-down", "currency"], Capacity.render); Capacity.render(); }
    if (page === "vat") {
      $("#vat-country").addEventListener("change", function () { VAT.fillRates(); VAT.render(); });
      $("#vat-rate").addEventListener("change", function () { VAT.toggleCustom(); VAT.render(); });
      bind(["vat-amount", "vat-mode", "vat-custom", "currency"], VAT.render);
      VAT.fillRates(); VAT.render();
    }
    if (page === "schengen") {
      var c = $("#sch-control"); if (!c.value) c.value = isoOf(todayNum());
      (CP.exampleStays || [null]).forEach(function (s) { Schengen.addRow(s && s[0], s && s[1]); });
      $("#add-stay").addEventListener("click", function () { Schengen.addRow(); });
      bind(["sch-control", "sch-entry"], Schengen.render);
      Schengen.render();
    }
    if (page === "bizdays") {
      var s = $("#bd-start"), e = $("#bd-end"), tn = todayNum();
      if (!s.value) s.value = isoOf(tn);
      if (!e.value) e.value = isoOf(tn + 30);
      bind(["bd-country", "bd-region", "bd-mode", "bd-start", "bd-end", "bd-n", "bd-inc-start", "bd-inc-end", "bd-saturday"], BizDays.render);
      BizDays.render();
    }
    if (page === "salary") {
      if (CP.prefill) $("#sal-amount").value = CP.prefill;
      $("#sal-dir").addEventListener("change", function () { Salary.toggle(); Salary.render(); });
      bind(["sal-amount", "sal-nt", "sal-period", "sal-status", "sal-am", "sal-time", "sal-pas"], Salary.render);
      Salary.toggle(); Salary.render();
    }
    if (page === "notary") {
      bind(["nf-price", "nf-dept", "nf-type", "nf-ftb", "nf-extra"], Notary.render);
      Notary.render();
    }
    if (page === "micro") {
      var pf = CP.prefillMicro;
      if (pf) { $("#me-amount").value = pf.amount; $("#me-activity").value = pf.activity; $("#me-trade").value = pf.trade; }
      bind(["me-activity", "me-trade", "me-amount", "me-period", "me-acre", "me-flat", "me-chamber", "me-zone"], Micro.render);
      Micro.render();
    }
    if (page === "ptz") {
      var pz = CP.prefillPtz;
      if (pz) { $("#pz-zone").value = pz.zone; $("#pz-persons").value = pz.persons; $("#pz-rfr").value = pz.rfr; $("#pz-cost").value = pz.cost; $("#pz-type").value = pz.type; }
      bind(["pz-zone", "pz-persons", "pz-rfr", "pz-type", "pz-cost", "pz-works"], Ptz.render);
      Ptz.render();
    }
    if (page === "severance") {
      var sv = CP.prefillSeverance;
      if (sv) { $("#sv-salary").value = sv.salary; $("#sv-years").value = sv.years; $("#sv-months").value = sv.months; }
      bind(["sv-type", "sv-salary", "sv-salary3", "sv-years", "sv-months", "sv-paid", "sv-conv", "sv-prev", "sv-pension"], Severance.render);
      Severance.render();
    }
    if (page === "unemployment") {
      var ue = CP.prefillUnemployment;
      if (ue) { $("#ue-salary").value = ue.salary; $("#ue-months").value = ue.months; $("#ue-age").value = ue.age; }
      bind(["ue-salary", "ue-months", "ue-age", "ue-end", "ue-first", "ue-csg"], Unemployment.render);
      Unemployment.render();
    }
    if (page === "incometax") {
      if (CP.prefillIncome) $("#ir-income").value = CP.prefillIncome;
      bind(["ir-mode", "ir-income", "ir-sal1", "ir-pen1", "ir-sal2", "ir-pen2", "ir-situation", "ir-children", "ir-shared",
            "ir-alone", "ir-casel", "ir-disabled", "ir-dchildren", "ir-veteran"], IncomeTax.render);
      IncomeTax.render();
    }
    if (page === "eu261") {
      ["eu-from", "eu-to"].forEach(function (id) {
        var el = document.getElementById(id);
        el.addEventListener("focus", function () { EU261.load(function () {}); }, { once: true });
        el.addEventListener("input", function () { EU261.load(function () { EU261.suggest(el); EU261.render(); }); });
        el.addEventListener("change", EU261.render);
      });
      bind(["eu-carrier", "eu-kind", "eu-delay-h", "eu-delay-m", "eu-notice", "eu-early-h", "eu-early-m", "eu-late-h", "eu-late-m", "eu-extra", "eu-volunteer", "eu-grounds"], EU261.render);
      var pe = CP.prefillEu261;  // pages per airline: first route of the table, arrival 3 hours late
      if (pe) { $("#eu-from").value = pe.from; $("#eu-to").value = pe.to; $("#eu-carrier").value = pe.carrier; $("#eu-kind").value = "delay"; $("#eu-delay-h").value = pe.h; $("#eu-delay-m").value = "0"; }
      $all("[data-kind]").forEach(function (el) { el.hidden = el.dataset.kind.split(" ").indexOf($("#eu-kind").value) < 0; });
      if ($("#eu-from").value) EU261.render();
    }
  }

  window.CalcPronto = { Salary: Salary, IncomeTax: IncomeTax, Notary: Notary, Micro: Micro, Ptz: Ptz, Severance: Severance, Unemployment: Unemployment, Loan: Loan, Capacity: Capacity, VAT: VAT, Schengen: Schengen, BizDays: BizDays, EU261: EU261, dayNum: dayNum, isoOf: isoOf, num: num };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
