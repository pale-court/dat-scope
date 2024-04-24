const dat_meta_root = new URL("https://raw.githubusercontent.com/pale-court/dat-meta/main/");

const sel_from = document.querySelector("#sel-from");
const sel_to = document.querySelector("#sel-to");

const doc_url = new URL(document.URL);
const doc_params = doc_url.searchParams;

const desired_from = doc_params.get("from");
const desired_to = doc_params.get("to");

const build_data = {};
let from_bid, to_bid;

const field_labels = {
    fixed_size: "Fixed section size",
    row_count: "Fixed row count",
    row_width: "Fixed row width",
    var_offset: "Variable section offset",
    var_size: "Variable section size",
};

class DatDiff extends HTMLElement {
    static observedAttributes = ["file"];

    constructor() {
        super();
        this.attr = {};
    }

    connectedCallback() {
        const from_file = build_data[from_bid].files[this.attr.file];
        const to_file = build_data[to_bid].files[this.attr.file];

        if (from_file && !to_file) {
            this.innerHTML = `${from_file.pretty_name} removed`;
            this.classList.add('removed');
        } else if (!from_file && to_file) {
            this.innerHTML = `${to_file.pretty_name} added`;
            this.classList.add('added');
        } else {
            this.classList.add('diff');
            this.innerHTML = `${to_file.pretty_name} changed<br>`;

            for (const [field, label] of Object.entries(field_labels)) {
                console.log(field);
                console.log(from_file);
                if (from_file.stats[field] !== to_file.stats[field]) {
                    const d = document.createElement('div');
                    d.classList.add("diff-head")
                    const prev=document.createElement('div');
                    prev.classList.add("removed")
                    prev.textContent = `${from_file.stats[field]}`

                    const curr=document.createElement('div');
                    curr.classList.add("added")
                    curr.textContent = `${to_file.stats[field]}`

                    d.textContent = `${label}`;
                    d.appendChild(prev)
                    d.appendChild(curr)
                    this.appendChild(d);
                }
            }
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        this.attr[name] = newValue;
        console.log(
            `Attribute ${name} has changed from ${oldValue} to ${newValue}.`,
        );
    }
}

customElements.define('dat-diff', DatDiff);

async function DownloadBuild(bid) {
    if (build_data[bid]) {
        return Promise.resolve(build_data[bid]);
    }
    const resp = await fetch(new URL(`builds/build-${bid}.json`, dat_meta_root));
    const js = await resp.json();
    const newFiles = {};
    Object.keys(js.files).forEach(f => {
        const fields = js.files[f];
        const dat_re = /^data\/(\w+)\.dat(?:64)?$/i;
        newFiles[f.toLowerCase()] = {
            stats: fields,
            pretty_name: dat_re.exec(f)[1]
        };
    });
    js.files = newFiles;
    build_data[bid] = js;
    console.log(js);
    return js;
}

async function SyncBuilds() {
    from_bid = sel_from.item(sel_from.selectedIndex).value;
    to_bid = sel_to.item(sel_to.selectedIndex).value;
    doc_url.searchParams.set("from", from_bid);
    doc_url.searchParams.set("to", to_bid);
    console.log(doc_url.searchParams);
    window.history.pushState({ path: doc_url.toString() }, "", doc_url);

    let build_from;
    let build_to;
    try {
        const resps = await Promise.all([DownloadBuild(from_bid), DownloadBuild(to_bid)]);
        build_from = resps[0];
        build_to = resps[1];
        console.log(resps);
    } catch (e) {
        build_from = null;
        build_to = null;
    }

    const diff_host = document.querySelector("#diff-host");

    // Remove old diff elements
    while (diff_host.firstChild) {
        diff_host.removeChild(diff_host.lastChild);
    }

    if (!build_from || !build_to) {
        // Communicate that one of the builds could not be obtained.
        diff_host.innerHTML = "Could not obtain one of the builds.<br>They may either be old enough to not have DAT64 files or new enough that the system has not ingested them yet.";
    }
    else {
        // Add new ones
        const filename_keys = Object.keys(build_from.files).concat(Object.keys(build_to.files)).sort();
        const filenames = new Set(filename_keys);
        filenames.forEach(file => {
            const from_file = build_from.files[file];
            const to_file = build_to.files[file];
            if (from_file && to_file) {
                let allSame = true;
                for (const field of Object.keys(field_labels)) {
                    if (from_file.stats[field] != to_file.stats[field]) {
                        allSame = false;
                    }
                }
                if (allSame) {
                    // Skip this file as it's of the same shape.
                    return;
                }
            }
            const elem = document.createElement("dat-diff");
            elem.setAttribute("file", file);
            diff_host.appendChild(elem);
        });
    }
}

fetch(new URL("./global.json", dat_meta_root)).then(resp => {
    resp.json().then(js => {
        console.log(js);
        builds = js.builds;
        const build_ids = Object.keys(builds).sort((a, b) => parseInt(b) - parseInt(a));
        build_ids.forEach(bid => {
            const build = builds[bid];
            const opt = document.createElement("option");
            opt.value = bid;
            opt.text = `${build.game_version} (build ${bid})`;
            sel_from.add(opt.cloneNode(true));
            sel_to.add(opt);
        });
        if (desired_from && builds[desired_from]) {
            sel_from.value = desired_from;
        }
        else {
            sel_from.value = sel_from.options[1].value;
        }

        if (desired_to && builds[desired_to]) {
            sel_to.value = desired_to;
        } else {
            sel_to.value = sel_to.options[0].value;
        }

        SyncBuilds();
    });
});

const sel_change_handler = ev => {
    console.log(ev);
    SyncBuilds();
};

sel_from.onchange = sel_change_handler;
sel_to.onchange = sel_change_handler;
