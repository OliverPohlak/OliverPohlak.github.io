const student = {
    id: 0,
    login: 'OliverPohlak',
    totalXP: 0,
    level: 0,
    transactions: [],
    progresses: [],
    doneProjects: []
};

const levelChanges = [];
const projectsBaseXP = {};
const GRAPHQL_ENDPOINT = `https://01.kood.tech/api/graphql-engine/v1/graphql`;
const firstDayOfNextMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1);
const levelFromXp = (xp, level = 0) => cumulXpForLevel(level) >= xp ? level : levelFromXp(xp, level + 1);
const cumulXpForLevel = (level, cumul = 0) => level > 0 ? cumulXpForLevel(level - 1, cumul + totalXPForLevel(level - 1)) : cumul;
const totalXPForLevel = (level) => Math.round((level * 0.66 + 1) * ((level + 3) * 150 + 50));
const firstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const fetchGraphQL = async (query, variables) => {
    const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    return await response.json();
};

const parseTransactions = async () => {
    let offset = 0;
    while (true) {
        const obj = await fetchGraphQL(`
            query get_transactions($login: String, $offset: Int) {
                transaction(
                    where: {
                        user: { login: { _eq: $login } },
                        type: { _eq: "xp" },
                        _or: [{object:{type: {_eq: "project"}}}, {object: {type: {_eq: "piscine"}}}]
                    },
                    offset: $offset,
                    ) {
                        object {
                        id
                        name
                    }
                    amount
                    createdAt
                }
            }`,
            {
                login: student.login,
                offset
            }
            );
            
            student.transactions.push(...obj.data.transaction);
            offset += 50;
            
            if (obj.data.transaction.length < 50) {
                break;
            }
    }

    student.transactions.sort((a, b) =>
    new Date(a.createdAt) > new Date(b.createdAt) ? 1 : -1
    );
};

const parseUserInfo = async () => {
    const obj = await fetchGraphQL(`
        query get_user($login: String) {
            user(where: { login: { _eq: $login } }) {
                id
                login
            }
        }`,
        {
            login: student.login,
        }
    );

    [student.id, student.login] = [obj.data.user[0].id, obj.data.user[0].login];
};

const parseProgresses = async () => {
    let offset = 0

    while (true) {
        const obj = await fetchGraphQL(`
            query get_progresses($login: String, $offset: Int) {
                progress(
                    where: {
                        user: { login: { _eq: $login } }
                        isDone: { _eq: true }
                        _or: [{object:{type: {_eq: "project"}}}, {object: {type: {_eq: "piscine"}}}]
                    }
                    distinct_on: objectId
                    offset: $offset
                ) {
                    object {
                        id
                        name
                    }
                }
            }`,
            {
                login: student.login,
                offset: offset,
            }
        )

        student.progresses.push(...obj.data.progress)

        offset += obj.data.progress.length

        if (obj.data.progress.length < 500) {
            offset = 0
            break
        }
    }
}

const parseProjectsBaseXP = () => {
    const completedProjects = new Set(student.progresses.map(progress => progress.object.id))

    student.transactions.forEach(transaction => {
        if (completedProjects.has(transaction.object.id)) {
            if (!projectsBaseXP[transaction.object.id]) {
                projectsBaseXP[transaction.object.id] = transaction.amount
            } else if (projectsBaseXP[transaction.object.id] < transaction.amount) {
                projectsBaseXP[transaction.object.id] = transaction.amount
            }
        }
    })
}

const parseDoneProjects = () => {
    student.transactions.forEach(transaction => {
        const projectBaseXP = projectsBaseXP[transaction.object.id]

        if (projectsBaseXP && projectBaseXP == transaction.amount) {
            student.totalXP += projectBaseXP
            const newLevel = levelFromXp(student.totalXP)
            
            if (newLevel > student.level) {
                student.level = newLevel
                levelChanges.push({ level: newLevel, date: new Date(transaction.createdAt) })
            }

            student.doneProjects.push({
                id: transaction.object.id,
                name: transaction.object.name,
                baseXP: projectBaseXP,
                totalXP: student.totalXP,
                date: new Date(transaction.createdAt)
            })
        }
    })
    student.doneProjects.sort((a, b) => a.date - b.date)
}

const getMonths = (fromDate, toDate) => {
    const fromYear = fromDate.getFullYear();
    const fromMonth = fromDate.getMonth();
    const toYear = toDate.getFullYear();
    const toMonth = toDate.getMonth();
    const months = [];
    for (let year = fromYear; year <= toYear; year++) {
        for (let month = (year === fromYear ? fromMonth : 0); month <= (year === toYear ? toMonth : 11); month++) {
            months.push(`${(month + 1).toString().padStart(2, '0')}/${year.toString().substr(-2)}`);
        }
    }
    return months;
};


const fillGraphs = (xpOverTimeGraph, levelOverTimeGraph) => {
    const firstDate = firstDayOfMonth(student.doneProjects[0].date)
    const lastDate = firstDayOfNextMonth(student.doneProjects[student.doneProjects.length - 1].date)
    const firstAndLastDateDiff = lastDate.getTime() - firstDate.getTime()
    const months = getMonths(firstDate, lastDate)
    const xLeftOffset = xpOverTimeGraph.leftOffset * 0.8
    const xpOverTimeGraphWidth = xpOverTimeGraph.width
    const xpOverTimeGraphHeight = xpOverTimeGraph.height
    const studentTotalXP = student.totalXP
    const studentLevel = student.level

    for (let i = 0; i < months.length; i++) {
        const x = (i / (months.length - 1) * xpOverTimeGraphWidth) + xpOverTimeGraph.leftOffset
        const y = xpOverTimeGraphHeight + 30
        const text = months[i]
        const type = 'x-label'
        xpOverTimeGraph.labels.push({ x, y, text, type })
        levelOverTimeGraph.labels.push({ x, y, text, type })
    }

    for (let i = 0; i <= 10; i++) {
        const y = (i == 0 ? 0 : xpOverTimeGraphHeight * (i / 10)) + 5
        const text = (i == 10 ? 0 : Math.round(studentTotalXP * (1 - (i / 10)))).toLocaleString()
        const type = 'y-label'
        xpOverTimeGraph.labels.push({ x: xLeftOffset, y, text, type })
    }

    for (let i = 0; i <= studentLevel; i++) {
        const y = (i == 0 ? levelOverTimeGraph.height : (levelOverTimeGraph.height * (1 - (i / studentLevel)))) + 5
        const text = i
        const type = 'y-label'
        levelOverTimeGraph.labels.push({ x: xLeftOffset, y, text, type })
    }

    for (let i = 1; i < student.doneProjects.length; i++) {
        const [prev, curr] = [student.doneProjects[i - 1], student.doneProjects[i]];
        const x1 = (prev.date.getTime() - firstDate) / firstAndLastDateDiff * xpOverTimeGraph.width;
        const x2 = (curr.date.getTime() - firstDate) / firstAndLastDateDiff * xpOverTimeGraph.width;
        const y1 = prev.totalXP / student.totalXP * xpOverTimeGraph.height;
        const y2 = curr.totalXP / student.totalXP * xpOverTimeGraph.height;
        if (i === 1 || i === 0) {
            xpOverTimeGraph.data.push({
                type: 'line',
                x1: 0,
                x2: x1,
                y1: 0,
                y2: y1,
            });
        }
        xpOverTimeGraph.data.push({ type: 'line', x1, x2, y1, y2 });
    }

    const levelOverTimeData = [];

    for (let i = 0; i < levelChanges.length - 1; i++) {
        const curr = levelChanges[i];
        const next = levelChanges[i + 1];
        const x1 = (curr.date.getTime() - firstDate) / firstAndLastDateDiff * levelOverTimeGraph.width;
        const x2 = (next.date.getTime() - firstDate) / firstAndLastDateDiff * levelOverTimeGraph.width;
        const y1 = curr.level / student.level * levelOverTimeGraph.height;
        const y2 = next.level / student.level * levelOverTimeGraph.height;

        if (i === 0) {
            levelOverTimeData.push({
                type: 'line',
                x1: 0,
                x2: x1,
                y1: 0,
                y2: y1,
            });
        }

        levelOverTimeData.push({
            type: 'line',
            x1: x1,
            x2: x2,
            y1: y1,
            y2: y2,
        });
    }
    levelOverTimeGraph.data = levelOverTimeData;
}

const drawGraph = (graph) => {
    let container = document.createElement('div');
    container.classList.add('graph-container');

    let description = document.createElement('p');
    description.classList.add('graph-description');
    description.textContent = graph.description;
    container.appendChild(description);

    let svg = document.createElement('svg');
    container.append(svg);
    svg.classList.add('graph');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewbox', `0 0 ${1100} ${600}`);

    let xGrid = document.createElement('g');
    svg.append(xGrid);
    xGrid.classList.add('grid', 'x-grid');

    let yGrid = document.createElement('g');
    svg.append(yGrid);
    yGrid.classList.add('grid', 'y-grid');

    let xLine = document.createElement('line');
    xGrid.append(xLine);
    xLine.setAttribute('x1', graph.leftOffset);
    xLine.setAttribute('x2', graph.leftOffset);
    xLine.setAttribute('y1', 0);
    xLine.setAttribute('y2', graph.topOffset);

    let yLine = document.createElement('line');
    yGrid.append(yLine);
    yLine.setAttribute('x1', graph.leftOffset);
    yLine.setAttribute('x2', graph.width + graph.leftOffset);
    yLine.setAttribute('y1', graph.topOffset);
    yLine.setAttribute('y2', graph.topOffset);

    let xLabels = document.createElement('g');
    svg.append(xLabels);
    xLabels.classList.add('labels', 'x-labels');

    let yLabels = document.createElement('g');
    svg.append(yLabels);
    yLabels.classList.add('labels', 'y-labels');

    for (let i = 0; i < graph.labels.length; i++) {
        let label = document.createElement('text');
        label.setAttribute('x', graph.labels[i].x);
        label.setAttribute('y', graph.labels[i].y);
        label.textContent = graph.labels[i].text;

        if (graph.labels[i].type == 'x-label') {
            xLabels.append(label);
        }
        if (graph.labels[i].type == 'y-label') {
            yLabels.append(label);
        }
    }

    let data = document.createElement('g');
    svg.append(data);
    data.classList.add('data');

    const dataLength = graph.data.length;
    for (let i = 0; i < dataLength; i++) {
        const el = document.createElement(graph.data[i].type);
        data.append(el);

        switch (graph.data[i].type) {
            case 'line':
                el.setAttribute('x1', `${graph.data[i].x1 + graph.leftOffset}`);
                el.setAttribute('x2', `${graph.data[i].x2 + graph.leftOffset}`);
                el.setAttribute('y1', `${graph.topOffset - graph.data[i].y1}`);
                el.setAttribute('y2', `${graph.topOffset - graph.data[i].y2}`);
                break;
            default:
                break;
        }
    }

    document.body.insertAdjacentHTML('beforeend', container.outerHTML);
}

const init = async () => {
    await Promise.all([parseUserInfo(), parseTransactions(), parseProgresses()])

    parseProjectsBaseXP()
    parseDoneProjects()

    document.getElementById('login').innerText = student.login
    document.getElementById('id').innerText = student.id
    document.getElementById('total-xp').innerText = student.totalXP.toLocaleString()
    document.getElementById('level').innerText = student.level

    const xpOverTimeGraph = {
        description: 'XP OVER TIME',
        width: 1000,
        height: 500,
        topOffset: 500,
        leftOffset: 100,
        labels: [],
        data: [],
    }

    const levelOverTimeGraph = {
        description: "LEVEL OVER TIME",
        width: 1000,
        height: 500,
        topOffset: 500,
        leftOffset: 100,
        labels: [],
        data: [],
    }

    fillGraphs(xpOverTimeGraph, levelOverTimeGraph)

    drawGraph(xpOverTimeGraph)
    drawGraph(levelOverTimeGraph)
}

init()