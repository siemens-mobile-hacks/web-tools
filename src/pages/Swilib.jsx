import Table from '@suid/material/Table';
import TableBody from '@suid/material/TableBody';
import TableCell from '@suid/material/TableCell';
import TableContainer from '@suid/material/TableContainer';
import TableHead from '@suid/material/TableHead';
import TableRow from '@suid/material/TableRow';
import ToggleButtonGroup from '@suid/material/ToggleButtonGroup';
import ToggleButton from '@suid/material/ToggleButton';
import Paper from '@suid/material/Paper';

function Swilib() {
	let getData = () => {
		let fuctions = [];
		for (let i = 0; i < 1; i++) {
			fuctions.push({
				id: i,
				name: `int UnknownFunction${i}(int a, int b)`,
				coverage: {
					ELKA: 100,
					NSG: 70,
					SG: 10
				}
			});
		}
		return fuctions;
	};

	let getPhones = () => {
		let phones = [
			// NSG ELKA
			'E71sw45',
			'EL71sw45',

			// NSG
			'C81sw51',
			'S75sw52',
			'SL75sw52',
			'S68sw47',

			// SG X75
			'CX75sw13',
			'CX75sw25',
			'M75sw25',
			'CF75sw23',
			'C75sw24',
			'C72sw22',

			// SG
			'CX70sw56',
			'SK65sw50',
			'SL65sw53',
			'S65sw58',
		];
		let ret = [];
		for (let p of phones) {
			let [model, sw] = p.split("sw");
			ret.push({model, sw});
		}
		return ret;
	};

	return (
		<>
			<ToggleButtonGroup color="primary" exclusive aria-label="Phone" value="all">
				<ToggleButton value="all" sx={{ textTransform: 'none', lineHeight: 'normal' }}>
					<small>ALL</small>
				</ToggleButton>

				<For each={getPhones()}>{(row) =>
					<ToggleButton value="web" sx={{ textTransform: 'none', lineHeight: 'normal' }}>
						<small>{row.model}<br />v{row.sw}</small>
					</ToggleButton>
				}</For>
			</ToggleButtonGroup>

			<TableContainer component={Paper}>
				<Table sx={{ minWidth: 650 }} size="small" aria-label="a dense table">
					<TableHead>
						<TableRow>
							<TableCell>#</TableCell>
							<TableCell>Function</TableCell>
							<TableCell>ELKA</TableCell>
							<TableCell>NSG</TableCell>
							<TableCell>SG</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						<For each={getData()}>{(row) =>
							<TableRow>
								<TableCell>{row.id.toString(16).padStart(3, '0').toUpperCase()}</TableCell>
								<TableCell>
									{row.name}<br />
									<small style={{ opacity: 0.5 }}>OldFunctionNmae, OldFunctionNmae, OldFunctionNmae</small>
								</TableCell>
								<TableCell>{row.coverage.ELKA}%</TableCell>
								<TableCell>{row.coverage.NSG}%</TableCell>
								<TableCell>{row.coverage.SG}%</TableCell>
							</TableRow>
						}</For>
					</TableBody>
				</Table>
			</TableContainer>
		</>
	);
}

export default Swilib;
