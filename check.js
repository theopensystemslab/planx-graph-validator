const fetch = require("isomorphic-unfetch");
const { alg, Graph } = require("graphlib");
const en = require("nanoid-good/locale/en");
const customAlphabet = require("nanoid-good").customAlphabet(en);
const nanoid = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  10
);

// const FILENAME = "test"
// const data = require(`./${FILENAME}.json`);
const fs = require("fs").promises;

async function gqlQuery(query, variables = {}) {
  const res = await fetch(`https://hasura.planx.uk/v1/graphql`, {
    method: "POST",
    headers: {
      "X-Hasura-Admin-Secret": process.env.HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors && json.errors[0].message.includes("x-hasura-admin-secret")) {
    throw Error("Invalid HASURA_SECRET");
  }
  return json;
}

const go = async (id) => {
  const response = await gqlQuery(
    `
    query GetFlow($id: uuid!) {
      flows_by_pk(id: $id) {
        data
      }
    }`,
    { id }
  );
  const { data } = response.data.flows_by_pk;

  console.log("got data...");

  const nodes = Object.entries(data.nodes).reduce((acc, [key, node]) => {
    if (data.edges.some(([src, tgt]) => src === key || tgt === key)) {
      delete node.responses;
      acc[key] = node;
    } else {
      console.error({ removeNode: key });
    }
    return acc;
  }, {});

  console.log("checking edges");

  const edges = data.edges.reduce((acc, [src, tgt]) => {
    if ((src === null || nodes[src]) && nodes[tgt]) {
      acc.push([src, tgt]);
    } else {
      console.error({ removeEdge: [src, tgt] });
    }

    return acc;
  }, []);

  const flow = { edges, nodes };

  const toGraphlib = (flow) => {
    // create a graph with the existing nodes and edges
    const g = new Graph({ directed: true, multigraph: false });
    Object.keys(flow.nodes).forEach((key) => {
      g.setNode(key);
    });
    flow.edges.forEach(([src, tgt]) => {
      g.setEdge(src, tgt);
    });
    return g;
  };

  const graph = toGraphlib(flow);

  const cycles = alg.findCycles(graph);

  if (cycles.length > 0) {
    throw console.error(
      JSON.stringify(
        {
          cycles: cycles.map((cycle) =>
            cycle.map((id) => {
              return {
                id,
                ...flow.nodes[id],
                ">": flow.edges
                  .filter(([src]) => src === id)
                  .map(([, tgt]) => tgt)
                  .filter((i) => cycle.includes(i)),
              };
            })
          ),
        },
        null,
        2
      )
    );
  }

  await fs.writeFile(`./${id}.json`, JSON.stringify(flow, null, 2));

  const ids = alg.preorder(graph, ["null"]);

  const dictionary = ids.reduce((acc, id) => {
    if (id === "null") {
      acc[id] = "_root";
    } else {
      acc[id] = nanoid();
    }
    return acc;
  }, {});

  const newData = ids.reduce((acc, id) => {
    let ob;
    if (id === "null") {
      ob = {
        edges: flow.edges
          .filter(([src]) => src === null)
          .map(([, tgt]) => dictionary[tgt]),
      };
    } else {
      // const { $t, text, ...data } = flow.nodes[id];
      const { $t, ...data } = flow.nodes[id];
      ob = {
        data,
        edges: flow.edges
          .filter(([src]) => src === id)
          .map(([, tgt]) => dictionary[tgt]),
        // text,
        type: $t,
      };
      if (ob.type <= 0) delete ob.type;
      // if (ob.text === "" || ob.text === null || ob.text === undefined)
      //   delete ob.text;
      if (ob.data === {}) delete ob.data;
      if (ob.edges.length === 0) delete ob.edges;
    }

    acc[dictionary[id]] = ob;
    return acc;
  }, {});

  await fs.writeFile(`./${id}.new.json`, JSON.stringify(newData, null, 2));

  await fs.writeFile(
    `./${id}.dictionary.json`,
    JSON.stringify(dictionary, null, 2)
  );
};

go("86d80cbe-04ad-4cec-aaba-4d1833f19033");
